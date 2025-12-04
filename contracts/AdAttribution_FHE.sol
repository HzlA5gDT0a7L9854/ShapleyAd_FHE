// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract AdAttribution_FHE is SepoliaConfig {
    struct EncryptedTouchpoint {
        uint256 campaignId;
        euint32 encryptedChannelId;
        euint32 encryptedTimestamp;
        euint32 encryptedImpressionValue;
        euint32 encryptedConversionValue;
        uint256 submissionTime;
    }

    struct DecryptedTouchpoint {
        uint32 channelId;
        uint32 timestamp;
        uint32 impressionValue;
        uint32 conversionValue;
        bool isRevealed;
    }

    struct ShapleyContribution {
        euint32 encryptedShapleyValue;
        euint32 encryptedMarginalGain;
    }

    uint256 public campaignCount;
    mapping(uint256 => EncryptedTouchpoint[]) public encryptedTouchpoints;
    mapping(uint256 => DecryptedTouchpoint[]) public decryptedTouchpoints;
    mapping(uint256 => ShapleyContribution[]) public shapleyValues;

    mapping(uint256 => uint256) private requestToCampaignId;
    
    event TouchpointSubmitted(uint256 indexed campaignId, uint256 submissionTime);
    event ShapleyValuesCalculated(uint256 indexed campaignId);
    event TouchpointsDecrypted(uint256 indexed campaignId);

    function createCampaign() public returns (uint256) {
        campaignCount += 1;
        return campaignCount;
    }

    function submitEncryptedTouchpoints(
        uint256 campaignId,
        euint32[] memory encryptedChannelIds,
        euint32[] memory encryptedTimestamps,
        euint32[] memory encryptedImpressionValues,
        euint32[] memory encryptedConversionValues
    ) public {
        require(encryptedChannelIds.length == encryptedTimestamps.length, "Array length mismatch");
        require(encryptedChannelIds.length == encryptedImpressionValues.length, "Array length mismatch");
        require(encryptedChannelIds.length == encryptedConversionValues.length, "Array length mismatch");

        for (uint i = 0; i < encryptedChannelIds.length; i++) {
            encryptedTouchpoints[campaignId].push(EncryptedTouchpoint({
                campaignId: campaignId,
                encryptedChannelId: encryptedChannelIds[i],
                encryptedTimestamp: encryptedTimestamps[i],
                encryptedImpressionValue: encryptedImpressionValues[i],
                encryptedConversionValue: encryptedConversionValues[i],
                submissionTime: block.timestamp
            }));

            decryptedTouchpoints[campaignId].push(DecryptedTouchpoint({
                channelId: 0,
                timestamp: 0,
                impressionValue: 0,
                conversionValue: 0,
                isRevealed: false
            }));
        }

        calculateShapleyValues(campaignId);
        emit TouchpointSubmitted(campaignId, block.timestamp);
    }

    function calculateShapleyValues(uint256 campaignId) private {
        EncryptedTouchpoint[] storage touchpoints = encryptedTouchpoints[campaignId];
        
        for (uint i = 0; i < touchpoints.length; i++) {
            // Simplified Shapley value calculation (real implementation would need more complex FHE operations)
            euint32 marginalGain = FHE.sub(
                touchpoints[i].encryptedConversionValue,
                FHE.div(touchpoints[i].encryptedImpressionValue, FHE.asEuint32(2))
            );
            
            shapleyValues[campaignId].push(ShapleyContribution({
                encryptedShapleyValue: FHE.div(
                    marginalGain,
                    FHE.asEuint32(touchpoints.length)
                ),
                encryptedMarginalGain: marginalGain
            }));
        }

        emit ShapleyValuesCalculated(campaignId);
    }

    function requestTouchpointsDecryption(uint256 campaignId) public {
        require(encryptedTouchpoints[campaignId].length > 0, "No touchpoints");
        require(!decryptedTouchpoints[campaignId][0].isRevealed, "Already decrypted");

        EncryptedTouchpoint[] storage touchpoints = encryptedTouchpoints[campaignId];
        bytes32[] memory ciphertexts = new bytes32[](touchpoints.length * 4);
        
        for (uint i = 0; i < touchpoints.length; i++) {
            ciphertexts[i*4] = FHE.toBytes32(touchpoints[i].encryptedChannelId);
            ciphertexts[i*4+1] = FHE.toBytes32(touchpoints[i].encryptedTimestamp);
            ciphertexts[i*4+2] = FHE.toBytes32(touchpoints[i].encryptedImpressionValue);
            ciphertexts[i*4+3] = FHE.toBytes32(touchpoints[i].encryptedConversionValue);
        }
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptTouchpoints.selector);
        requestToCampaignId[reqId] = campaignId;
    }

    function decryptTouchpoints(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 campaignId = requestToCampaignId[requestId];
        require(campaignId != 0, "Invalid request");
        require(!decryptedTouchpoints[campaignId][0].isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32[] memory results = abi.decode(cleartexts, (uint32[]));
        
        for (uint i = 0; i < decryptedTouchpoints[campaignId].length; i++) {
            decryptedTouchpoints[campaignId][i].channelId = results[i*4];
            decryptedTouchpoints[campaignId][i].timestamp = results[i*4+1];
            decryptedTouchpoints[campaignId][i].impressionValue = results[i*4+2];
            decryptedTouchpoints[campaignId][i].conversionValue = results[i*4+3];
            decryptedTouchpoints[campaignId][i].isRevealed = true;
        }

        emit TouchpointsDecrypted(campaignId);
    }

    function requestShapleyValuesDecryption(uint256 campaignId) public {
        require(shapleyValues[campaignId].length > 0, "No Shapley values");
        
        ShapleyContribution[] storage contributions = shapleyValues[campaignId];
        bytes32[] memory ciphertexts = new bytes32[](contributions.length * 2);
        
        for (uint i = 0; i < contributions.length; i++) {
            ciphertexts[i*2] = FHE.toBytes32(contributions[i].encryptedShapleyValue);
            ciphertexts[i*2+1] = FHE.toBytes32(contributions[i].encryptedMarginalGain);
        }
        
        FHE.requestDecryption(ciphertexts, this.decryptShapleyValues.selector);
    }

    function decryptShapleyValues(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        FHE.checkSignatures(requestId, cleartexts, proof);
        uint32[] memory results = abi.decode(cleartexts, (uint32[]));
        // Process decrypted Shapley values as needed
    }

    function getDecryptedTouchpoints(uint256 campaignId) public view returns (
        uint32[] memory channelIds,
        uint32[] memory timestamps,
        uint32[] memory impressionValues,
        uint32[] memory conversionValues,
        bool[] memory isRevealed
    ) {
        DecryptedTouchpoint[] storage points = decryptedTouchpoints[campaignId];
        channelIds = new uint32[](points.length);
        timestamps = new uint32[](points.length);
        impressionValues = new uint32[](points.length);
        conversionValues = new uint32[](points.length);
        isRevealed = new bool[](points.length);
        
        for (uint i = 0; i < points.length; i++) {
            channelIds[i] = points[i].channelId;
            timestamps[i] = points[i].timestamp;
            impressionValues[i] = points[i].impressionValue;
            conversionValues[i] = points[i].conversionValue;
            isRevealed[i] = points[i].isRevealed;
        }
        
        return (channelIds, timestamps, impressionValues, conversionValues, isRevealed);
    }
}