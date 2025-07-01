"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Search,
  ArrowRight,
  Link,
  Unlink,
  BarChart3,
  FileText,
  Database,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Users,
  TrendingUp,
  Filter,
  Download,
  Settings,
  Zap,
  Network,
  Phone,
  Wifi,
  Shield,
  Server,
  Globe,
  Move,
  Target
} from 'lucide-react';

const ServiceMapping = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOntologyNode, setSelectedOntologyNode] = useState(null);
  const [selectedContractCategory, setSelectedContractCategory] = useState(null);
  const [mappings, setMappings] = useState(new Map());
  const [expandedNodes, setExpandedNodes] = useState(new Set(['Data', 'Voice', 'Other Managed', 'Connection Services', 'Professional Services', 'Equipment', 'Unmapped']));
  const [activeView, setActiveView] = useState('mapping');
  
  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Original Service Ontology Structure
  const serviceOntology = {
    "Data": {
      "Internet": {
        "Fiber": ["Internet - Dedicated Fiber", "Internet - Uverse", "Internet - Fios", "Internet - Fioptics", "Internet - Shared Fiber", "Internet - Dark Fiber"],
        "Coax": ["Internet - Coax", "Enterprise Guest WiFi", "Internet - Fixed Cellular - ACC", "Internet - IP Transit"],
        "DSL": ["Internet - DSL"],
        "Fixed Cellular": ["Internet - Fixed Cellular - 4G/LTE", "Internet - Fixed Cellular 5G"]
      },
      "Private Network": {
        "Fiber": ["Private Network - Fiber", "MPLS", "VPN"],
        "Copper": ["Private Network - Copper"]
      },
      "TV": {
        "Fiber": ["IPTV", "Streaming TV"],
        "Coax": ["Cable TV", "Digital TV"]
      }
    },
    "Voice": {
      "POTS": {
        "Copper": ["Plain Old Telephone", "Analog Lines"],
        "LTE": ["Voice over LTE"]
      },
      "SIP": {
        "Copper": ["SIP Trunking", "VoIP"]
      },
      "PRI": {
        "Copper": ["Primary Rate Interface", "T1 Voice"]
      },
      "Paging": {
        "Generic": ["Text Paging", "Voice Paging"]
      }
    },
    "Other Managed": {
      "Cloud": {
        "Generic": ["Cloud Storage", "Cloud Computing", "AWS Services"]
      },
      "Security": {
        "Generic": ["Firewall Management", "VPN Services", "Threat Detection"]
      },
      "SD-WAN": {
        "Generic": ["Software Defined WAN", "Network Optimization"]
      },
      "Support": {
        "Generic": ["24/7 Support", "Technical Support"]
      }
    },
    "Wireless": {
      "Wireless": {
        "LTE": ["Mobile Data", "4G Services", "IoT Connectivity"]
      }
    }
  };

  // Contract Analysis Results
  const contractAnalysis = {
    "Connection Services": {
      "Data/Internet Services": {
        count: 938,
        occurrences: 6206,
        topServices: ["Business Internet (671)", "Fiber Internet Access (369)", "Business Cable (275)", "Cellular Broadband (5GB) (248)", "Business Internet Standard (184)", "Dedicated Internet Access (156)", "Business Internet Plus (142)", "Enterprise Internet (128)", "Fiber Optic Internet (115)", "High-Speed Internet (98)", "Broadband Internet (87)", "Metro Ethernet (76)", "Business DSL (65)", "Internet Protocol (54)", "Data Services (43)"]
      },
      "Voice Services": {
        count: 533,
        occurrences: 3490,
        topServices: ["Business Voice (195)", "Mobility Lines (176)", "Toll Free Number (155)", "Full Featured Voice Lines (147)", "Business Class Voice (146)", "VoIP Services (134)", "SIP Trunking (125)", "Primary Rate Interface (118)", "Local Voice Service (102)", "Long Distance (89)", "Conference Calling (78)", "Voice Mail (67)", "Call Forwarding (56)", "Direct Inward Dialing (45)", "Auto Attendant (34)"]
      },
      "TV/Video Services": {
        count: 100,
        occurrences: 881,
        topServices: ["Business TV (155)", "Business Class TV (151)", "Music Choice W/Business TV (66)", "Coax Data/Video Services (65)", "Spectrum Business TV (53)", "Cable TV Service (48)", "Digital TV (42)", "IPTV (38)", "Video Conferencing (35)", "Streaming Services (29)", "HD Channels (25)", "Premium Channels (22)", "Sports Package (18)", "International Channels (15)", "Pay-Per-View (12)"]
      },
      "Security Services": {
        count: 47,
        occurrences: 490,
        topServices: ["SecurityEdge (150)", "CBI 100 with WiFi and Security (71)", "Security Suite - 25 PC (71)", "Desktop Security (30)", "Security Edge (25)", "Firewall Management (22)", "Intrusion Detection (19)", "VPN Security (16)", "Antivirus Protection (14)", "Content Filtering (12)", "Threat Monitoring (10)", "Security Assessment (8)", "Vulnerability Scanning (6)", "Identity Management (5)", "Encryption Services (3)"]
      },
      "Network Services": {
        count: 625,
        occurrences: 3590,
        topServices: ["Static IP Address (181)", "1 Static IP (135)", "Dynamic IP Address (128)", "IPv4 Static Address Block (82)", "5 Static IP (68)", "DNS Services (58)", "DHCP Services (47)", "Network Monitoring (39)", "Load Balancing (32)", "Traffic Management (28)", "Quality of Service (24)", "Bandwidth Management (21)", "Network Redundancy (18)", "VLAN Services (15)", "Network Analytics (12)"]
      },
      "Mobile/Cellular Services": {
        count: 71,
        occurrences: 249,
        topServices: ["wireless (29)", "wireless/cellular (20)", "Fixed cellular connectivity (19)", "Spectrum mobile (11)", "CoreNexa Mobile App (10)", "4G LTE Service (9)", "5G Service (8)", "Mobile Data Plans (7)", "Device Management (6)", "Mobile Security (5)", "International Roaming (4)", "Mobile Hotspot (3)", "Push-to-Talk (2)", "Fleet Management (1)"]
      }
    },
    "Professional Services": {
      "Installation & Setup": {
        count: 223,
        occurrences: 908,
        topServices: ["Professional Installation (40)", "Professional Installation Fee (40)", "Activation Support (32)", "Site Survey (28)", "Equipment Setup (25)", "Network Configuration (23)", "System Integration (20)", "Cable Installation (18)", "Fiber Installation (16)", "Equipment Mounting (14)", "Testing & Commissioning (12)", "Documentation (10)", "Training Session (8)", "Go-Live Support (6)", "Post-Installation Support (4)"]
      },
      "Management & Monitoring": {
        count: 223,
        occurrences: 799,
        topServices: ["SD-WAN Management-Concierge (77)", "Managed Router (Basic) (35)", "Managed Security Services (35)", "Network Monitoring (32)", "Performance Management (28)", "Proactive Monitoring (25)", "Incident Management (22)", "Change Management (19)", "Asset Management (16)", "Configuration Management (14)", "Capacity Planning (12)", "Patch Management (10)", "Backup Services (8)", "Disaster Recovery (6)", "Business Continuity (4)"]
      },
      "Support & Maintenance": {
        count: 69,
        occurrences: 309,
        topServices: ["Expedited Order Service (41)", "Expedited Shipping (39)", "Business Hours Support (24)", "24/7 Technical Support (22)", "Field Service (19)", "Remote Support (16)", "Maintenance Windows (14)", "Emergency Support (12)", "Escalation Support (10)", "Help Desk Services (8)", "Ticket Management (6)", "Knowledge Base Access (4)", "User Support (3)", "Training Support (2)"]
      },
      "Training & Consulting": {
        count: 30,
        occurrences: 70,
        topServices: ["Annual user training session (34)", "Training (5)", "Engineering consulting (2)", "Network Design Consulting (4)", "Security Consulting (3)", "Performance Optimization (3)", "Best Practices Review (2)", "Architecture Review (2)", "Technology Assessment (2)", "Migration Planning (2)", "Capacity Planning Consultation (1)", "Compliance Consulting (1)", "Risk Assessment (1)", "Strategy Development (1)"]
      },
      "Configuration Services": {
        count: 65,
        occurrences: 141,
        topServices: ["ENE (Enterprise Network Edge) (32)", "Network system inventory (14)", "plus config (6)", "Router Configuration (8)", "Switch Configuration (7)", "Firewall Configuration (6)", "VPN Configuration (5)", "QoS Configuration (4)", "VLAN Configuration (4)", "DNS Configuration (3)", "DHCP Configuration (3)", "Load Balancer Configuration (2)", "Access Control Configuration (2)", "Monitoring Configuration (2)", "Backup Configuration (1)"]
      }
    },
    "Equipment": {
      "Modems & Gateways": {
        count: 213,
        occurrences: 2126,
        topServices: ["Modem (324)", "Equipment - Modem (312)", "AirLink RV50 LTE Modem (225)", "Cable Modem (189)", "DSL Modem (156)", "Fiber Modem (134)", "Gateway Device (112)", "Wireless Modem (98)", "Enterprise Modem (87)", "Industrial Modem (76)", "Backup Modem (65)", "Cellular Gateway (54)", "IoT Gateway (43)", "Edge Gateway (32)", "Security Gateway (21)"]
      },
      "TV/Video Equipment": {
        count: 129,
        occurrences: 985,
        topServices: ["TV Box + Remote (STB) (271)", "TV Adapter (DTA) (187)", "Cable Box & Remote (68)", "Digital Receiver (55)", "HD Set-Top Box (44)", "4K Set-Top Box (36)", "Streaming Device (28)", "Video Encoder (22)", "Video Decoder (18)", "Distribution Amplifier (14)", "HDMI Splitter (11)", "Coaxial Splitter (9)", "Signal Booster (7)", "Remote Control (5)", "Mounting Hardware (3)"]
      },
      "Voice Equipment": {
        count: 298,
        occurrences: 1347,
        topServices: ["Cordless Deskphone (129)", "Cordless Handset (129)", "Voice - eMTA Equipment Fee (106)", "IP Phone (98)", "Analog Phone (87)", "Conference Phone (76)", "Wireless Handset (65)", "SIP Phone (54)", "Video Phone (43)", "Desk Phone (32)", "Headset (28)", "Phone Adapter (24)", "PBX Equipment (20)", "Auto Attendant Box (16)", "Call Recording Device (12)"]
      },
      "Network Equipment": {
        count: 136,
        occurrences: 563,
        topServices: ["Wifi Pro Equipment Fee (101)", "Wifi Pro Expanded Coverage (77)", "Network Equipment (19)", "Managed Router (34)", "Enterprise Switch (28)", "Access Point (24)", "Network Hub (20)", "Ethernet Switch (16)", "Wireless Controller (14)", "Network Bridge (12)", "Repeater (10)", "Network Adapter (8)", "Patch Panel (6)", "Cable Management (4)", "Rack Equipment (2)"]
      },
      "Equipment Fees": {
        count: 47,
        occurrences: 406,
        topServices: ["Internet Equipment Fee (120)", "Connection Pro Equipment Fee (54)", "Equipment Fee - Cameras (49)", "Monthly Equipment Rental (38)", "Installation Equipment Fee (32)", "Maintenance Equipment Fee (28)", "Upgrade Equipment Fee (24)", "Replacement Equipment Fee (20)", "Extended Warranty Fee (16)", "Equipment Insurance (12)", "Shipping Fee (8)", "Handling Fee (6)", "Configuration Fee (4)", "Testing Fee (3)", "Return Fee (2)"]
      }
    }
  };

  // Initialize default mappings based on logical connections
  useEffect(() => {
    const defaultMappings = new Map();
    
    // Data mappings
    defaultMappings.set('Data-Internet', ['Connection Services-Data/Internet Services', 'Connection Services-Network Services']);
    defaultMappings.set('Data-TV', ['Connection Services-TV/Video Services', 'Equipment-TV/Video Equipment']);
    defaultMappings.set('Data-Private Network', ['Connection Services-Network Services']);
    
    // Voice mappings
    defaultMappings.set('Voice-POTS', ['Connection Services-Voice Services', 'Equipment-Voice Equipment']);
    defaultMappings.set('Voice-SIP', ['Connection Services-Voice Services']);
    defaultMappings.set('Voice-PRI', ['Connection Services-Voice Services']);
    defaultMappings.set('Voice-Paging', ['Connection Services-Mobile/Cellular Services']);
    
    // Other Managed mappings
    defaultMappings.set('Other Managed-Security', ['Connection Services-Security Services', 'Professional Services-Management & Monitoring']);
    defaultMappings.set('Other Managed-SD-WAN', ['Professional Services-Management & Monitoring', 'Professional Services-Configuration Services']);
    defaultMappings.set('Other Managed-Support', ['Professional Services-Support & Maintenance', 'Professional Services-Training & Consulting']);
    defaultMappings.set('Other Managed-Cloud', ['Professional Services-Management & Monitoring']);
    
    // Wireless mappings
    defaultMappings.set('Wireless-Wireless', ['Connection Services-Mobile/Cellular Services', 'Equipment-Network Equipment']);
    
    setMappings(defaultMappings);
  }, []);

  // Drag and Drop Handlers
  const handleDragStart = (e, contractKey) => {
    setDraggedItem(contractKey);
    setIsDragging(true);
    e.dataTransfer.setData('text/plain', contractKey);
    e.dataTransfer.effectAllowed = 'copy';
    
    // Add visual feedback
    e.target.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    setDraggedItem(null);
    setIsDragging(false);
    setDragOverTarget(null);
    e.target.style.opacity = '1';
  };

  const handleDragOver = (e, ontologyKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverTarget(ontologyKey);
  };

  const handleDragLeave = (e) => {
    // Only clear if we're actually leaving the drop zone
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverTarget(null);
    }
  };

  const handleDrop = (e, ontologyKey) => {
    e.preventDefault();
    const contractKey = e.dataTransfer.getData('text/plain');
    
    if (contractKey && ontologyKey) {
      // Add to existing mappings or create new mapping
      const newMappings = new Map(mappings);
      
      if (newMappings.has(ontologyKey)) {
        const currentMappings = newMappings.get(ontologyKey);
        if (!currentMappings.includes(contractKey)) {
          newMappings.set(ontologyKey, [...currentMappings, contractKey]);
        }
      } else {
        newMappings.set(ontologyKey, [contractKey]);
      }
      
      setMappings(newMappings);
    }
    
    setDragOverTarget(null);
    setDraggedItem(null);
    setIsDragging(false);
  };

  // Function to get all services for a selected ontology node
  const getOntologyServices = (selectedNode) => {
    if (!selectedNode) return [];
    
    const [category, type] = selectedNode.split('-');
    const categoryData = serviceOntology[category];
    if (!categoryData || !categoryData[type]) return [];
    
    // Flatten all services from all facilities under this type
    const allServices = [];
    Object.values(categoryData[type]).forEach(facilityServices => {
      allServices.push(...facilityServices);
    });
    
    return allServices;
  };

  // Calculate mapping statistics and unmapped categories
  const mappingStats = useMemo(() => {
    const ontologyNodes = [];
    Object.entries(serviceOntology).forEach(([cat, types]) => {
      Object.entries(types).forEach(([type]) => {
        ontologyNodes.push(`${cat}-${type}`);
      });
    });
    
    const contractNodes = [];
    Object.entries(contractAnalysis).forEach(([mainCat, subCats]) => {
      Object.keys(subCats).forEach(subCat => {
        contractNodes.push(`${mainCat}-${subCat}`);
      });
    });
    
    const mappedOntology = ontologyNodes.filter(node => mappings.has(node));
    const mappedContract = new Set();
    mappings.forEach(contractList => {
      contractList.forEach(contract => mappedContract.add(contract));
    });
    
    return {
      ontologyTotal: ontologyNodes.length,
      ontologyMapped: mappedOntology.length,
      contractTotal: contractNodes.length,
      contractMapped: mappedContract.size,
      totalMappings: mappings.size,
      unmappedContract: contractNodes.filter(node => !mappedContract.has(node))
    };
  }, [mappings]);

  // Get category icons
  const getCategoryIcon = (category) => {
    const icons = {
      'Data': Network,
      'Voice': Phone,
      'Other Managed': Settings,
      'Wireless': Wifi,
      'Connection Services': Globe,
      'Professional Services': Users,
      'Equipment': Server
    };
    return icons[category] || FileText;
  };

  // Toggle mapping between ontology and contract services
  const toggleMapping = (ontologyKey, contractKey) => {
    const newMappings = new Map(mappings);
    
    if (newMappings.has(ontologyKey)) {
      const currentMappings = newMappings.get(ontologyKey);
      if (currentMappings.includes(contractKey)) {
        // Remove mapping
        const updatedMappings = currentMappings.filter(m => m !== contractKey);
        if (updatedMappings.length === 0) {
          newMappings.delete(ontologyKey);
        } else {
          newMappings.set(ontologyKey, updatedMappings);
        }
      } else {
        // Add mapping
        newMappings.set(ontologyKey, [...currentMappings, contractKey]);
      }
    } else {
      // Create new mapping
      newMappings.set(ontologyKey, [contractKey]);
    }
    
    setMappings(newMappings);
  };

  // Check if nodes are mapped
  const isMapped = (ontologyKey, contractKey) => {
    return mappings.has(ontologyKey) && mappings.get(ontologyKey).includes(contractKey);
  };

  // Get mapping strength (color intensity based on occurrences)
  const getMappingStrength = (contractKey) => {
    const [mainCat, subCat] = contractKey.split('-');
    const occurrences = contractAnalysis[mainCat]?.[subCat]?.occurrences || 0;
    
    if (occurrences > 5000) return 'high';
    if (occurrences > 1000) return 'medium';
    return 'low';
  };

  const toggleExpanded = (nodeId) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Service Ontology Mapping System</h1>
              <p className="text-gray-600">
                Map contract services to standardized taxonomy 
                <span className="text-blue-600 font-medium"> • Drag & Drop Enabled</span>
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
                <Move className="w-4 h-4" />
                <span className="text-sm font-medium">Drag categories to map</span>
              </div>
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                <Download className="w-4 h-4" />
                Export Mappings
              </button>
              <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                <Settings className="w-4 h-4" />
                Configure
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{mappingStats.ontologyMapped}/{mappingStats.ontologyTotal}</div>
              <div className="text-sm text-gray-600">Ontology Mapped</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{mappingStats.contractMapped}/{mappingStats.contractTotal}</div>
              <div className="text-sm text-gray-600">Contract Categories Mapped</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-600">{mappingStats.unmappedContract.length}</div>
              <div className="text-sm text-gray-600">Unmapped Categories</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{mappingStats.totalMappings}</div>
              <div className="text-sm text-gray-600">Active Mappings</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">8,050</div>
              <div className="text-sm text-gray-600">Total Contract Services</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">37,515</div>
              <div className="text-sm text-gray-600">Service Occurrences</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Service Ontology Panel - DROP ZONES */}
        <div className="w-1/2 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200 bg-blue-50">
            <h2 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
              <Database className="w-5 h-5" />
              Service Ontology (Standardized)
              <Target className="w-4 h-4 text-blue-600" />
            </h2>
            <p className="text-sm text-blue-700 mt-1">Drop zones for contract categories • Click to select nodes</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {Object.entries(serviceOntology).map(([category, types]) => {
              const categoryKey = category;
              const isExpanded = expandedNodes.has(categoryKey);
              const CategoryIcon = getCategoryIcon(category);
              
              return (
                <div key={category} className="mb-4">
                  <div 
                    className="flex items-center py-3 px-4 cursor-pointer rounded-lg hover:bg-blue-50 transition-colors"
                    onClick={() => toggleExpanded(categoryKey)}
                  >
                    {isExpanded ? 
                      <ChevronDown className="w-5 h-5 mr-3 text-gray-400" /> : 
                      <ChevronRight className="w-5 h-5 mr-3 text-gray-400" />
                    }
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                      <CategoryIcon className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{category}</div>
                      <div className="text-sm text-gray-500">{Object.keys(types).length} service types</div>
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="ml-6 border-l-2 border-blue-100 pl-4 mt-2">
                      {Object.entries(types).map(([type, facilities]) => {
                        const ontologyKey = `${category}-${type}`;
                        const isSelected = selectedOntologyNode === ontologyKey;
                        const mappedCount = mappings.has(ontologyKey) ? mappings.get(ontologyKey).length : 0;
                        const isDropTarget = dragOverTarget === ontologyKey;
                        const isDragActive = isDragging && draggedItem;
                        
                        return (
                          <div 
                            key={type}
                            className={`flex items-center justify-between py-2 px-3 cursor-pointer rounded-md transition-all relative ${
                              isSelected ? 'bg-blue-100 border-l-4 border-blue-500' : 
                              isDropTarget ? 'bg-green-100 border-2 border-green-400 border-dashed' :
                              isDragActive ? 'bg-blue-25 border-2 border-blue-200 border-dashed' :
                              'hover:bg-gray-50'
                            }`}
                            onClick={() => setSelectedOntologyNode(isSelected ? null : ontologyKey)}
                            onDragOver={(e) => handleDragOver(e, ontologyKey)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, ontologyKey)}
                          >
                            {/* Drop zone indicator */}
                            {isDropTarget && (
                              <div className="absolute inset-0 bg-green-100 bg-opacity-50 rounded-md flex items-center justify-center">
                                <div className="flex items-center gap-2 text-green-700 font-medium">
                                  <Target className="w-4 h-4" />
                                  Drop to map
                                </div>
                              </div>
                            )}
                            
                            <div className="flex items-center flex-1">
                              <div className="w-6 h-6 bg-blue-50 rounded-md flex items-center justify-center mr-3">
                                <Network className="w-3 h-3 text-blue-500" />
                              </div>
                              <div>
                                <div className="font-medium text-gray-800">{type}</div>
                                <div className="text-xs text-gray-500">
                                  {Object.values(facilities).reduce((sum, f) => sum + f.length, 0)} services
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {mappedCount > 0 && (
                                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                                  {mappedCount} mapped
                                </span>
                              )}
                              {mappedCount > 0 ? 
                                <CheckCircle2 className="w-4 h-4 text-green-500" /> :
                                <AlertCircle className="w-4 h-4 text-gray-300" />
                              }
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Contract Analysis Panel - DRAGGABLE ITEMS */}
        <div className="w-1/2 bg-white flex flex-col">
          <div className="p-4 border-b border-gray-200 bg-green-50">
            <h2 className="text-lg font-semibold text-green-900 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Contract Analysis Results
              <Move className="w-4 h-4 text-green-600" />
            </h2>
            <p className="text-sm text-green-700 mt-1">Draggable categories • 7,428 telecom contracts analyzed</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {/* Regular Categories */}
            {Object.entries(contractAnalysis).map(([mainCategory, subCategories]) => {
              const mainCategoryKey = mainCategory;
              const isExpanded = expandedNodes.has(mainCategoryKey);
              const CategoryIcon = getCategoryIcon(mainCategory);
              
              return (
                <div key={mainCategory} className="mb-4">
                  <div 
                    className="flex items-center py-3 px-4 cursor-pointer rounded-lg hover:bg-green-50 transition-colors"
                    onClick={() => toggleExpanded(mainCategoryKey)}
                  >
                    {isExpanded ? 
                      <ChevronDown className="w-5 h-5 mr-3 text-gray-400" /> : 
                      <ChevronRight className="w-5 h-5 mr-3 text-gray-400" />
                    }
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                      <CategoryIcon className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{mainCategory}</div>
                      <div className="text-sm text-gray-500">{Object.keys(subCategories).length} subcategories</div>
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="ml-6 border-l-2 border-green-100 pl-4 mt-2">
                      {Object.entries(subCategories).map(([subCategory, data]) => {
                        const contractKey = `${mainCategory}-${subCategory}`;
                        const isSelected = selectedContractCategory === contractKey;
                        const strength = getMappingStrength(contractKey);
                        const isLinked = Array.from(mappings.values()).some(mappingList => 
                          mappingList.includes(contractKey)
                        );
                        const isBeingDragged = draggedItem === contractKey;
                        
                        return (
                          <div 
                            key={subCategory}
                            draggable={true}
                            onDragStart={(e) => handleDragStart(e, contractKey)}
                            onDragEnd={handleDragEnd}
                            className={`flex items-center justify-between py-2 px-3 cursor-pointer rounded-md transition-all ${
                              isSelected ? 'bg-green-100 border-l-4 border-green-500' : 
                              'hover:bg-gray-50'
                            } ${isBeingDragged ? 'opacity-50' : ''}`}
                            onClick={() => setSelectedContractCategory(isSelected ? null : contractKey)}
                          >
                            <div className="flex items-center flex-1">
                              <div className="flex items-center gap-2 mr-3">
                                <Move className="w-3 h-3 text-gray-400 drag-handle" />
                                <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
                                  strength === 'high' ? 'bg-red-100' : 
                                  strength === 'medium' ? 'bg-orange-100' : 'bg-yellow-100'
                                }`}>
                                  <TrendingUp className={`w-3 h-3 ${
                                    strength === 'high' ? 'text-red-500' : 
                                    strength === 'medium' ? 'text-orange-500' : 'text-yellow-500'
                                  }`} />
                                </div>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-gray-800 truncate">{subCategory}</div>
                                <div className="text-xs text-gray-500">
                                  {data.count} unique services • {data.occurrences} occurrences
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 ml-2">
                              {selectedOntologyNode && (
                                <button
                                  className={`p-1 rounded transition-colors ${
                                    isMapped(selectedOntologyNode, contractKey) 
                                      ? 'bg-red-100 hover:bg-red-200 text-red-600' 
                                      : 'bg-blue-100 hover:bg-blue-200 text-blue-600'
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleMapping(selectedOntologyNode, contractKey);
                                  }}
                                >
                                  {isMapped(selectedOntologyNode, contractKey) ? 
                                    <Unlink className="w-3 h-3" /> : 
                                    <Link className="w-3 h-3" />
                                  }
                                </button>
                              )}
                              {isLinked ? 
                                <MapPin className="w-4 h-4 text-blue-500" /> :
                                <MapPin className="w-4 h-4 text-gray-300" />
                              }
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unmapped Categories Section */}
            {mappingStats.unmappedContract.length > 0 && (
              <div className="mb-4">
                <div 
                  className="flex items-center py-3 px-4 cursor-pointer rounded-lg hover:bg-amber-50 transition-colors bg-amber-25 border border-amber-200"
                  onClick={() => toggleExpanded('Unmapped')}
                >
                  {expandedNodes.has('Unmapped') ? 
                    <ChevronDown className="w-5 h-5 mr-3 text-gray-400" /> : 
                    <ChevronRight className="w-5 h-5 mr-3 text-gray-400" />
                  }
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center mr-3">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-amber-900">Unmapped Categories</div>
                    <div className="text-sm text-amber-700">{mappingStats.unmappedContract.length} categories need mapping</div>
                  </div>
                  <div className="bg-amber-200 text-amber-800 px-2 py-1 rounded-full text-xs font-medium">
                    Needs Attention
                  </div>
                </div>
                
                {expandedNodes.has('Unmapped') && (
                  <div className="ml-6 border-l-2 border-amber-100 pl-4 mt-2">
                    {mappingStats.unmappedContract.map((contractKey) => {
                      const [mainCat, subCat] = contractKey.split('-');
                      const data = contractAnalysis[mainCat]?.[subCat];
                      const isSelected = selectedContractCategory === contractKey;
                      const strength = getMappingStrength(contractKey);
                      const isBeingDragged = draggedItem === contractKey;
                      
                      return (
                        <div 
                          key={contractKey}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, contractKey)}
                          onDragEnd={handleDragEnd}
                          className={`flex items-center justify-between py-2 px-3 cursor-pointer rounded-md transition-all ${
                            isSelected ? 'bg-amber-100 border-l-4 border-amber-500' : 'hover:bg-amber-50'
                          } ${isBeingDragged ? 'opacity-50' : ''}`}
                          onClick={() => setSelectedContractCategory(isSelected ? null : contractKey)}
                        >
                          <div className="flex items-center flex-1">
                            <div className="flex items-center gap-2 mr-3">
                              <Move className="w-3 h-3 text-gray-400 drag-handle" />
                              <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
                                strength === 'high' ? 'bg-red-100' : 
                                strength === 'medium' ? 'bg-orange-100' : 'bg-yellow-100'
                              }`}>
                                <TrendingUp className={`w-3 h-3 ${
                                  strength === 'high' ? 'text-red-500' : 
                                  strength === 'medium' ? 'text-orange-500' : 'text-yellow-500'
                                }`} />
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-gray-800 truncate">
                                <span className="text-amber-600">{mainCat}</span> - {subCat}
                              </div>
                              {data && (
                                <div className="text-xs text-gray-500">
                                  {data.count} unique services • {data.occurrences} occurrences
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 ml-2">
                            {selectedOntologyNode && (
                              <button
                                className="p-1 rounded transition-colors bg-blue-100 hover:bg-blue-200 text-blue-600"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleMapping(selectedOntologyNode, contractKey);
                                }}
                              >
                                <Link className="w-3 h-3" />
                              </button>
                            )}
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selected Node Details */}
      {(selectedOntologyNode || selectedContractCategory) && (
        <div className="bg-white border-t border-gray-200 p-4 max-h-80 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {selectedOntologyNode && (
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Selected Ontology Node (Drop Zone)
                </h3>
                <div className="space-y-3">
                  <div><span className="font-medium">Node:</span> {selectedOntologyNode}</div>
                  <div><span className="font-medium">Mappings:</span> {mappings.has(selectedOntologyNode) ? mappings.get(selectedOntologyNode).length : 0}</div>
                  
                  <div>
                    <span className="font-medium">All Unique Services ({getOntologyServices(selectedOntologyNode).length}):</span>
                    <div className="mt-2 max-h-40 overflow-y-auto bg-white rounded border p-2">
                      <div className="space-y-1">
                        {getOntologyServices(selectedOntologyNode).map((service, idx) => (
                          <div key={idx} className="text-xs text-blue-800 px-2 py-1 bg-blue-100 rounded">
                            {service}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {mappings.has(selectedOntologyNode) && (
                    <div>
                      <span className="font-medium">Mapped to:</span>
                      <div className="mt-1 space-y-1">
                        {mappings.get(selectedOntologyNode).map(mapping => (
                          <span key={mapping} className="inline-block text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded mr-1">
                            {mapping}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {selectedContractCategory && (
              <div className="bg-green-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-green-900 mb-3 flex items-center gap-2">
                  <Move className="w-5 h-5" />
                  Selected Contract Category (Draggable)
                </h3>
                <div className="space-y-3">
                  <div><span className="font-medium">Category:</span> {selectedContractCategory}</div>
                  {(() => {
                    const [mainCat, subCat] = selectedContractCategory.split('-');
                    const data = contractAnalysis[mainCat]?.[subCat];
                    return data ? (
                      <>
                        <div><span className="font-medium">Unique Services:</span> {data.count}</div>
                        <div><span className="font-medium">Total Occurrences:</span> {data.occurrences}</div>
                        <div>
                          <span className="font-medium">All Available Services ({data.topServices.length}):</span>
                          <div className="mt-2 max-h-40 overflow-y-auto bg-white rounded border p-2">
                            <div className="space-y-1">
                              {data.topServices.map((service, idx) => (
                                <div key={idx} className="text-xs text-green-800 px-2 py-1 bg-green-100 rounded">
                                  {service}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="p-3 bg-green-100 rounded-md">
                          <div className="text-sm text-green-800 font-medium">💡 Drag & Drop Tip</div>
                          <div className="text-xs text-green-700 mt-1">
                            Drag this category and drop it on any ontology node to create a mapping. Multiple categories can be mapped to the same node.
                          </div>
                        </div>
                      </>
                    ) : null;
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceMapping;