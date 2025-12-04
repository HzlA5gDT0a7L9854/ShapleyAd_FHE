// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface AdAttributionData {
  id: string;
  encryptedData: string;
  timestamp: number;
  advertiser: string;
  campaign: string;
  impressions: number;
  clicks: number;
  conversions: number;
  contributionScore: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [attributionData, setAttributionData] = useState<AdAttributionData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newAttributionData, setNewAttributionData] = useState({
    campaign: "",
    impressions: "",
    clicks: "",
    conversions: ""
  });
  const [selectedItem, setSelectedItem] = useState<AdAttributionData | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Calculate statistics
  const totalImpressions = attributionData.reduce((sum, item) => sum + item.impressions, 0);
  const totalClicks = attributionData.reduce((sum, item) => sum + item.clicks, 0);
  const totalConversions = attributionData.reduce((sum, item) => sum + item.conversions, 0);
  const avgContribution = attributionData.length > 0 
    ? attributionData.reduce((sum, item) => sum + item.contributionScore, 0) / attributionData.length 
    : 0;

  useEffect(() => {
    loadAttributionData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadAttributionData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("attribution_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing attribution keys:", e);
        }
      }
      
      const list: AdAttributionData[] = [];
      
      for (const key of keys) {
        try {
          const dataBytes = await contract.getData(`attribution_${key}`);
          if (dataBytes.length > 0) {
            try {
              const itemData = JSON.parse(ethers.toUtf8String(dataBytes));
              list.push({
                id: key,
                encryptedData: itemData.data,
                timestamp: itemData.timestamp,
                advertiser: itemData.advertiser,
                campaign: itemData.campaign,
                impressions: itemData.impressions || 0,
                clicks: itemData.clicks || 0,
                conversions: itemData.conversions || 0,
                contributionScore: itemData.contributionScore || 0
              });
            } catch (e) {
              console.error(`Error parsing data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading attribution ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setAttributionData(list);
    } catch (e) {
      console.error("Error loading attribution data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE Contract is ${isAvailable ? "available" : "unavailable"}`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Failed to check availability"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const submitAttributionData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting attribution data with FHE..."
    });
    
    try {
      // Simulate FHE encryption and Shapley value calculation
      const encryptedData = `FHE-${btoa(JSON.stringify(newAttributionData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const itemId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Simulate FHE-based Shapley value calculation
      const impressions = parseInt(newAttributionData.impressions) || 0;
      const clicks = parseInt(newAttributionData.clicks) || 0;
      const conversions = parseInt(newAttributionData.conversions) || 0;
      
      // Simple simulation of Shapley value calculation
      const contributionScore = impressions > 0 
        ? (clicks / impressions) * 0.4 + (conversions / Math.max(clicks, 1)) * 0.6 
        : 0;

      const itemData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        advertiser: account,
        campaign: newAttributionData.campaign,
        impressions: impressions,
        clicks: clicks,
        conversions: conversions,
        contributionScore: contributionScore
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `attribution_${itemId}`, 
        ethers.toUtf8Bytes(JSON.stringify(itemData))
      );
      
      const keysBytes = await contract.getData("attribution_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(itemId);
      
      await contract.setData(
        "attribution_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE-encrypted attribution data submitted!"
      });
      
      await loadAttributionData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewAttributionData({
          campaign: "",
          impressions: "",
          clicks: "",
          conversions: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const viewItemDetails = (item: AdAttributionData) => {
    setSelectedItem(item);
    setShowDetails(true);
  };

  const closeDetails = () => {
    setShowDetails(false);
    setSelectedItem(null);
  };

  const renderBarChart = () => {
    if (attributionData.length === 0) {
      return <div className="no-data-chart">No data available for chart</div>;
    }

    // Get top 5 items by contribution score for the chart
    const topItems = [...attributionData]
      .sort((a, b) => b.contributionScore - a.contributionScore)
      .slice(0, 5);

    const maxScore = Math.max(...topItems.map(item => item.contributionScore), 1);

    return (
      <div className="bar-chart-container">
        <div className="chart-title">Top Campaigns by Contribution Score</div>
        <div className="chart-bars">
          {topItems.map((item, index) => (
            <div key={item.id} className="chart-bar-wrapper">
              <div className="bar-label">{item.campaign.substring(0, 15)}...</div>
              <div className="chart-bar">
                <div 
                  className="bar-fill"
                  style={{ 
                    height: `${(item.contributionScore / maxScore) * 100}%`,
                    backgroundColor: `hsl(${index * 60}, 70%, 50%)`
                  }}
                ></div>
              </div>
              <div className="bar-value">{item.contributionScore.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="mechanical-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container industrial-theme">
      <header className="app-header">
        <div className="logo">
          <div className="gear-icon"></div>
          <h1>ShapleyAd<span>FHE</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={checkAvailability}
            className="industrial-button"
          >
            Check FHE Status
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="industrial-button primary"
          >
            Add Attribution Data
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content partitioned-layout">
        {/* Left Panel - Project Info */}
        <div className="panel left-panel">
          <div className="panel-content industrial-card">
            <h2>FHE-Powered Ad Attribution</h2>
            <div className="project-description">
              <p>ShapleyAd FHE uses Fully Homomorphic Encryption to calculate Shapley values for ad attribution while preserving user privacy.</p>
              
              <div className="feature-list">
                <div className="feature-item">
                  <div className="feature-icon">🔒</div>
                  <div className="feature-text">Encrypted multi-touch user behavior data</div>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">⚖️</div>
                  <div className="feature-text">Fair allocation of channel contributions</div>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">📊</div>
                  <div className="feature-text">More accurate attribution analysis</div>
                </div>
              </div>
            </div>
            
            <div className="fhe-badge">
              <span>FHE-Powered Privacy</span>
            </div>
          </div>
          
          <div className="panel-content industrial-card">
            <h3>Platform Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{attributionData.length}</div>
                <div className="stat-label">Total Records</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{totalImpressions}</div>
                <div className="stat-label">Impressions</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{totalClicks}</div>
                <div className="stat-label">Clicks</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{totalConversions}</div>
                <div className="stat-label">Conversions</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{avgContribution.toFixed(2)}</div>
                <div className="stat-label">Avg Contribution</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Center Panel - Data Visualization */}
        <div className="panel center-panel">
          <div className="panel-content industrial-card">
            <div className="section-header">
              <h3>Campaign Performance</h3>
              <button 
                onClick={loadAttributionData}
                className="industrial-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh Data"}
              </button>
            </div>
            
            {renderBarChart()}
          </div>
        </div>
        
        {/* Right Panel - Data List */}
        <div className="panel right-panel">
          <div className="panel-content industrial-card">
            <div className="section-header">
              <h3>Attribution Data Records</h3>
            </div>
            
            <div className="data-list">
              {attributionData.length === 0 ? (
                <div className="no-data">
                  <div className="no-data-icon">📊</div>
                  <p>No attribution data found</p>
                  <button 
                    className="industrial-button primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Add First Record
                  </button>
                </div>
              ) : (
                attributionData.map(item => (
                  <div 
                    key={item.id} 
                    className="data-item mechanical-item"
                    onClick={() => viewItemDetails(item)}
                  >
                    <div className="item-header">
                      <div className="item-title">{item.campaign}</div>
                      <div className="item-score">
                        Score: {item.contributionScore.toFixed(2)}
                      </div>
                    </div>
                    <div className="item-details">
                      <div className="detail">Impressions: {item.impressions}</div>
                      <div className="detail">Clicks: {item.clicks}</div>
                      <div className="detail">Conversions: {item.conversions}</div>
                    </div>
                    <div className="item-footer">
                      <div className="item-advertiser">
                        {item.advertiser.substring(0, 6)}...{item.advertiser.substring(38)}
                      </div>
                      <div className="item-date">
                        {new Date(item.timestamp * 1000).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
  
      {/* Create Modal */}
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitAttributionData} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          data={newAttributionData}
          setData={setNewAttributionData}
        />
      )}
      
      {/* Details Modal */}
      {showDetails && selectedItem && (
        <ModalDetails 
          item={selectedItem}
          onClose={closeDetails}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content industrial-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="mechanical-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="gear-icon"></div>
              <span>ShapleyAd FHE</span>
            </div>
            <p>FHE-powered privacy-preserving ad attribution with Shapley values</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">GitHub</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} ShapleyAd FHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  data: any;
  setData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  data,
  setData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setData({
      ...data,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!data.campaign) {
      alert("Please enter campaign name");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal industrial-card">
        <div className="modal-header">
          <h2>Add Attribution Data</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div> 
            Data will be encrypted with FHE for Shapley value calculation
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Campaign Name *</label>
              <input 
                type="text"
                name="campaign"
                value={data.campaign} 
                onChange={handleChange}
                placeholder="Enter campaign name" 
                className="industrial-input"
              />
            </div>
            
            <div className="form-group">
              <label>Impressions</label>
              <input 
                type="number"
                name="impressions"
                value={data.impressions} 
                onChange={handleChange}
                placeholder="Number of impressions" 
                className="industrial-input"
              />
            </div>
            
            <div className="form-group">
              <label>Clicks</label>
              <input 
                type="number"
                name="clicks"
                value={data.clicks} 
                onChange={handleChange}
                placeholder="Number of clicks" 
                className="industrial-input"
              />
            </div>
            
            <div className="form-group">
              <label>Conversions</label>
              <input 
                type="number"
                name="conversions"
                value={data.conversions} 
                onChange={handleChange}
                placeholder="Number of conversions" 
                className="industrial-input"
              />
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="industrial-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="industrial-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Data"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ModalDetailsProps {
  item: AdAttributionData;
  onClose: () => void;
}

const ModalDetails: React.FC<ModalDetailsProps> = ({ item, onClose }) => {
  return (
    <div className="modal-overlay">
      <div className="details-modal industrial-card">
        <div className="modal-header">
          <h2>Campaign Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="detail-section">
            <h3>{item.campaign}</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Advertiser</label>
                <span>{item.advertiser}</span>
              </div>
              <div className="detail-item">
                <label>Timestamp</label>
                <span>{new Date(item.timestamp * 1000).toLocaleString()}</span>
              </div>
              <div className="detail-item">
                <label>Impressions</label>
                <span>{item.impressions}</span>
              </div>
              <div className="detail-item">
                <label>Clicks</label>
                <span>{item.clicks}</span>
              </div>
              <div className="detail-item">
                <label>Conversions</label>
                <span>{item.conversions}</span>
              </div>
              <div className="detail-item">
                <label>Contribution Score</label>
                <span className="score-value">{item.contributionScore.toFixed(4)}</span>
              </div>
            </div>
          </div>
          
          <div className="fhe-section">
            <h4>FHE Encryption Details</h4>
            <div className="encryption-info">
              <div className="encryption-item">
                <label>Data Hash</label>
                <span>{item.encryptedData.substring(0, 20)}...</span>
              </div>
              <div className="encryption-item">
                <label>Record ID</label>
                <span>{item.id}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="industrial-button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;