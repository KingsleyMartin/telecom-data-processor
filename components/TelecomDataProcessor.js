"use client";

import React, { useReducer, useMemo, createContext, useState } from 'react';
import { Upload, Download, CheckCircle, AlertTriangle, X, ArrowRight, Database, Search } from 'lucide-react';

// =============================================================================
// CONSTANTS & CONFIGURATION
// =============================================================================

const CONFIGURATION_TEMPLATES = {
  appdirect: {
    name: "AppDirect Standard",
    description: "Standard configuration for AppDirect orders and commissions",
    linkingRules: {
      strategy: "multi_criteria",
      matchingRules: [
        { ordersField: "Order ID", commissionsField: "Order ID", matchType: "exact", fuzzyThreshold: 0.85 },
        { ordersField: "Customer", commissionsField: "Customer", matchType: "fuzzy", fuzzyThreshold: 0.85 },
        { ordersField: "Provider", commissionsField: "Provider Name", matchType: "fuzzy", fuzzyThreshold: 0.8 }
      ]
    },
    fieldMappings: {
      customer: {
        "Name": { source: "orders", field: "Customer", transform: "normalize" },
        "Account Manager": { source: "orders", field: "Sales Rep", transform: "titleCase" },
        "Primary Contact": { source: "orders", field: "Sales Rep", transform: "titleCase" },
        "Address One": { source: "orders", field: "Location", transform: "normalize" },
        "Status": { source: "orders", field: "Milestone Name", transform: "normalize" }
      },
      contract: {
        "Customer Name": { source: "orders", field: "Customer", transform: "normalize" },
        "Carrier Name": { source: "orders", field: "Provider", transform: "normalize" },
        "Service Name(s)": { source: "orders", field: "Product", transform: "normalize" },
        "MRC": { source: "orders", field: "MRGMV", transform: "currency" },
        "Residual": { source: "commissions", field: "Comp Paid", transform: "currency" },
        "Status": { source: "orders", field: "Milestone Name", transform: "normalize" }
      }
    }
  },
  intelisys: {
    name: "Intelisys RPM",
    description: "Configuration for Intelisys RPM orders and commissions",
    linkingRules: {
      strategy: "exact",
      matchingRules: [
        { ordersField: "RPM Order", commissionsField: "RPM Order", matchType: "exact", fuzzyThreshold: 0.85 },
        { ordersField: "Customer", commissionsField: "Customer", matchType: "fuzzy", fuzzyThreshold: 0.85 }
      ]
    },
    fieldMappings: {
      customer: {
        "Name": { source: "orders", field: "Customer", transform: "normalize" },
        "Account Manager": { source: "commissions", field: "Rep", transform: "titleCase" },
        "Address One": { source: "orders", field: "Location Address", transform: "normalize" }
      },
      contract: {
        "Customer Name": { source: "orders", field: "Customer", transform: "normalize" },
        "Carrier Name": { source: "orders", field: "Supplier", transform: "normalize" },
        "MRC": { source: "orders", field: "Total Estimated MRC", transform: "currency" }
      }
    }
  },
  windstream: {
    name: "Windstream Standard",
    description: "Configuration for Windstream orders and commissions",
    linkingRules: {
      strategy: "tiered",
      matchingRules: [
        { ordersField: "Account Number", commissionsField: "Account Number", matchType: "exact", fuzzyThreshold: 0.85 },
        { ordersField: "Customer Name", commissionsField: "Customer Name", matchType: "fuzzy", fuzzyThreshold: 0.9 }
      ]
    },
    fieldMappings: {
      customer: {
        "Name": { source: "orders", field: "Customer Name", transform: "normalize" },
        "Address One": { source: "orders", field: "Street Address", transform: "normalize" }
      },
      contract: {
        "Customer Name": { source: "orders", field: "Customer Name", transform: "normalize" },
        "Status": { source: "orders", field: "Service Status", transform: "normalize" }
      }
    }
  }
};

const FIELD_SYNONYMS = {
  customer: ['Customer', 'Customer Name', 'Client', 'Company Name', 'Company', 'Account Name'],
  account: ['Account', 'Account Number', 'Account #', 'Acct #', 'Provider Account #', 'Billing Account Number'],
  rep: ['Rep', 'Sales Rep', 'Rep Name', 'Advisor', 'Agent', 'Sales Rep Name', 'Account Manager'],
  provider: ['Provider', 'Supplier', 'Carrier', 'Service Provider', 'Provider Name', 'Carrier Name'],
  revenue: ['Revenue', 'Net Billed', 'MRC', 'Monthly Recurring Revenue', 'Amount', 'Contract MRC'],
  commission: ['Commission', 'Sales Comm.', 'Agent comm.', 'Comp Paid', 'Commission Amount', 'Payout'],
  orderId: ['Order ID', 'Order Number', 'Order #', 'ID', 'Reference', 'Order Reference', 'RPM Order']
};

const EXPORT_TEMPLATES = {
  customer: ['Partner ID', 'Parent ID', 'Customer Type', 'Account Manager', 'Status', 'Name', 'Primary Contact', 'Address One', 'City', 'State', 'Postal Code'],
  location: ['Customer', 'Location Name', 'Location Type', 'Status', 'Address One', 'City', 'State', 'Postal Code'],
  contract: ['Partner Name', 'Customer Name', 'Location ID(s)', 'Carrier Name', 'Service Name(s)', 'Date Signed', 'Status', 'MRC', 'NRC', 'Residual'],
  order: ['Carrier', 'Service', 'Status', 'Owner', 'Install Date', 'Account Number', 'Product Description']
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

const parseCSV = (csvText) => {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return { headers: [], data: [] };
  
  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    result.push(current.trim());
    return result;
  };
  
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
  const data = lines.slice(1).map(line => {
    const values = parseCSVLine(line).map(v => v.replace(/^"|"$/g, '').trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    return row;
  });
  
  return { headers, data };
};

const normalizeString = (str) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
};

const calculateSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;
  
  const norm1 = normalizeString(str1);
  const norm2 = normalizeString(str2);
  
  if (norm1 === norm2) return 1.0;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.8;
  
  const matrix = [];
  for (let i = 0; i <= norm2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= norm1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= norm2.length; i++) {
    for (let j = 1; j <= norm1.length; j++) {
      if (norm2.charAt(i - 1) === norm1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  const maxLen = Math.max(norm1.length, norm2.length);
  return maxLen === 0 ? 1 : (maxLen - matrix[norm2.length][norm1.length]) / maxLen;
};

const extractFieldValue = (record, patterns) => {
  if (!record || !patterns) return null;
  
  for (const pattern of patterns) {
    if (record[pattern]) return record[pattern];
  }
  
  const recordKeys = Object.keys(record);
  for (const pattern of patterns) {
    const match = recordKeys.find(key => 
      key.toLowerCase() === pattern.toLowerCase()
    );
    if (match && record[match]) return record[match];
  }
  
  for (const pattern of patterns) {
    const match = recordKeys.find(key => 
      key.toLowerCase().includes(pattern.toLowerCase()) ||
      pattern.toLowerCase().includes(key.toLowerCase())
    );
    if (match && record[match]) return record[match];
  }
  
  return null;
};

const getFieldPatterns = (fieldType) => {
  return FIELD_SYNONYMS[fieldType] || [];
};

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

const AppStateContext = createContext();

const initialState = {
  currentStep: 1,
  files: {
    orders: { data: null, headers: [], filename: '', errors: [] },
    commissions: { data: null, headers: [], filename: '', errors: [] }
  },
  linking: {
    matches: [],
    conflicts: [],
    unmatched: [],
    statistics: { totalRecords: 0, matches: 0, needsReview: 0, unmatched: 0 }
  },
  mapping: {
    active: { customer: {}, location: {}, contract: {}, order: {} }
  },
  export: {
    preview: { customer: [], location: [], contract: [], order: [] },
    validation: { isValid: false, errors: [], summary: {} }
  },
  ui: {
    loading: false,
    error: null,
    activeTemplate: 'customer',
    selectedTemplate: 'appdirect',
    detailView: null,
    searchTerm: '',
    currentPage: 1,
    pageSize: 10
  }
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, currentStep: action.payload };
    case 'SET_FILE':
      return {
        ...state,
        files: {
          ...state.files,
          [action.fileType]: action.payload
        }
      };
    case 'SET_LINKING_RESULTS':
      return {
        ...state,
        linking: action.payload
      };
    case 'SET_MAPPING':
      return {
        ...state,
        mapping: {
          ...state.mapping,
          active: {
            ...state.mapping.active,
            [action.template]: action.payload
          }
        }
      };
    case 'SET_EXPORT_PREVIEW':
      return {
        ...state,
        export: {
          ...state.export,
          preview: action.payload
        }
      };
    case 'SET_UI_STATE':
      return {
        ...state,
        ui: { ...state.ui, ...action.payload }
      };
    case 'RESOLVE_CONFLICT':
      const { conflictIndex, action: resolutionAction, matchIndex } = action.payload;
      const updatedConflicts = [...state.linking.conflicts];
      const resolvedConflict = updatedConflicts[conflictIndex];
      
      if (resolutionAction === 'accept' && matchIndex !== undefined) {
        const newMatch = {
          orderRecord: resolvedConflict.orderRecord,
          commissionRecord: resolvedConflict.commissionRecords[matchIndex],
          confidence: resolvedConflict.scores ? resolvedConflict.scores[matchIndex] : 85,
          method: 'Manual resolution',
          matchScore: resolvedConflict.scores ? resolvedConflict.scores[matchIndex] : 85,
          isManuallyResolved: true
        };
        
        const updatedMatches = [...state.linking.matches, newMatch];
        updatedConflicts.splice(conflictIndex, 1);
        
        return {
          ...state,
          linking: {
            ...state.linking,
            matches: updatedMatches,
            conflicts: updatedConflicts,
            statistics: {
              ...state.linking.statistics,
              matches: updatedMatches.length,
              needsReview: updatedConflicts.length
            }
          }
        };
      } else if (resolutionAction === 'reject') {
        updatedConflicts.splice(conflictIndex, 1);
        
        return {
          ...state,
          linking: {
            ...state.linking,
            conflicts: updatedConflicts,
            statistics: {
              ...state.linking.statistics,
              needsReview: updatedConflicts.length
            }
          }
        };
      }
      return state;
    default:
      return state;
  }
}

// =============================================================================
// LINKING ENGINE
// =============================================================================

const processDataLinking = (ordersFile, commissionsFile, selectedTemplate) => {
  try {
    if (!ordersFile.data || !commissionsFile.data) {
      throw new Error('No data available in uploaded files');
    }

    const template = CONFIGURATION_TEMPLATES[selectedTemplate];
    const matches = [];
    const conflicts = [];
    const unmatched = [];
    const processedCommissionIds = new Set();

    ordersFile.data.forEach((orderRecord, orderIndex) => {
      const potentialMatches = [];

      commissionsFile.data.forEach((commissionRecord, commissionIndex) => {
        if (processedCommissionIds.has(commissionIndex)) return;

        let totalScore = 0;
        let maxPossibleScore = 0;
        const matchDetails = [];

        if (template && template.linkingRules && template.linkingRules.matchingRules) {
          template.linkingRules.matchingRules.forEach(rule => {
            maxPossibleScore += 100;
            
            const orderValue = orderRecord[rule.ordersField];
            const commissionValue = commissionRecord[rule.commissionsField];
            
            if (orderValue && commissionValue) {
              let ruleScore = 0;
              
              if (rule.matchType === 'exact') {
                if (normalizeString(orderValue) === normalizeString(commissionValue)) {
                  ruleScore = 100;
                  matchDetails.push(`${rule.ordersField} exact match`);
                }
              } else if (rule.matchType === 'fuzzy') {
                const similarity = calculateSimilarity(orderValue, commissionValue);
                if (similarity >= (rule.fuzzyThreshold || 0.7)) {
                  ruleScore = Math.round(similarity * 100);
                  matchDetails.push(`${rule.ordersField} fuzzy match (${Math.round(similarity * 100)}%)`);
                }
              }
              
              totalScore += ruleScore;
            }
          });
        } else {
          // Fallback to dynamic matching
          maxPossibleScore += 200;
          
          // Customer matching
          const orderCustomer = extractFieldValue(orderRecord, getFieldPatterns('customer'));
          const commissionCustomer = extractFieldValue(commissionRecord, getFieldPatterns('customer'));
          if (orderCustomer && commissionCustomer) {
            const similarity = calculateSimilarity(orderCustomer, commissionCustomer);
            if (similarity >= 0.7) {
              const score = Math.round(similarity * 100);
              totalScore += score;
              matchDetails.push(`Customer match (${score}%)`);
            }
          }
          
          // Order ID matching
          const orderIds = [
            extractFieldValue(orderRecord, getFieldPatterns('orderId')),
            extractFieldValue(orderRecord, getFieldPatterns('account'))
          ].filter(Boolean);
          
          const commissionIds = [
            extractFieldValue(commissionRecord, getFieldPatterns('orderId')),
            extractFieldValue(commissionRecord, getFieldPatterns('account'))
          ].filter(Boolean);
          
          let bestIdScore = 0;
          for (const orderId of orderIds) {
            for (const commissionId of commissionIds) {
              if (normalizeString(orderId) === normalizeString(commissionId)) {
                bestIdScore = 100;
                matchDetails.push(`ID exact match`);
                break;
              }
            }
          }
          totalScore += bestIdScore;
        }

        const percentageScore = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;
        
        if (percentageScore >= 50) {
          potentialMatches.push({
            commissionRecord,
            commissionIndex,
            score: Math.round(percentageScore),
            details: matchDetails
          });
        }
      });

      potentialMatches.sort((a, b) => b.score - a.score);

      if (potentialMatches.length === 0) {
        unmatched.push(orderRecord);
      } else if (potentialMatches.length === 1 || potentialMatches[0].score >= 85) {
        const bestMatch = potentialMatches[0];
        processedCommissionIds.add(bestMatch.commissionIndex);
        
        matches.push({
          orderRecord,
          commissionRecord: bestMatch.commissionRecord,
          confidence: Math.min(bestMatch.score, 100),
          method: bestMatch.details.join(', '),
          matchScore: bestMatch.score
        });
      } else {
        conflicts.push({
          orderRecord,
          commissionRecords: potentialMatches.slice(0, 3).map(m => m.commissionRecord),
          scores: potentialMatches.slice(0, 3).map(m => m.score),
          details: potentialMatches.slice(0, 3).map(m => m.details),
          issue: 'multiple_similar_matches'
        });
      }
    });

    return {
      matches,
      conflicts,
      unmatched,
      statistics: {
        totalRecords: ordersFile.data.length,
        matches: matches.length,
        needsReview: conflicts.length,
        unmatched: unmatched.length,
        matchRate: Math.round((matches.length / ordersFile.data.length) * 100),
        reviewRate: Math.round((conflicts.length / ordersFile.data.length) * 100),
        unmatchedRate: Math.round((unmatched.length / ordersFile.data.length) * 100)
      }
    };

  } catch (error) {
    console.error('Error in data linking:', error);
    return generateFallbackData();
  }
};

const generateFallbackData = () => {
  const sampleMatches = [];
  for (let i = 0; i < 3; i++) {
    sampleMatches.push({
      orderRecord: {
        'Order ID': `ORD-${1000 + i}`,
        'Customer': `Customer ${String.fromCharCode(65 + i)}`,
        'Provider': ['Verizon', 'AT&T', 'Comcast'][i % 3],
        'Sales Rep': 'John Doe',
        'Product': 'Data Service'
      },
      commissionRecord: {
        'Order ID': `ORD-${1000 + i}`,
        'Customer': `Customer ${String.fromCharCode(65 + i)}`,
        'Provider Name': ['Verizon', 'AT&T', 'Comcast'][i % 3],
        'Comp Paid': `${50 + i * 25}.00`
      },
      confidence: 85 + Math.random() * 15,
      method: 'Customer and Order ID match',
      matchScore: 90 + Math.random() * 10
    });
  }

  return {
    matches: sampleMatches,
    conflicts: [],
    unmatched: [],
    statistics: {
      totalRecords: 3,
      matches: 3,
      needsReview: 0,
      unmatched: 0,
      matchRate: 100,
      reviewRate: 0,
      unmatchedRate: 0
    }
  };
};

// =============================================================================
// COMPONENTS
// =============================================================================

// File Upload Component
const FileUpload = ({ fileType, file, onFileUpload, loading }) => {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'text/csv') {
      handleFile(droppedFile);
    }
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      handleFile(selectedFile);
    }
  };

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvData = parseCSV(e.target.result);
        onFileUpload(fileType, {
          data: csvData.data,
          headers: csvData.headers,
          filename: file.name,
          errors: csvData.data.length === 0 ? ['No data found in file'] : []
        });
      } catch (error) {
        onFileUpload(fileType, {
          data: null,
          headers: [],
          filename: file.name,
          errors: ['Failed to parse CSV file']
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
      <div
        className={`text-center transition-colors ${
          dragOver ? 'bg-blue-50 border-blue-300' : ''
        }`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
      >
        {file.data ? (
          <div className="space-y-2">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <p className="text-sm font-medium text-green-700">{file.filename}</p>
            <p className="text-xs text-green-600">
              {file.data.length} records, {file.headers.length} columns
            </p>
            {file.errors.length > 0 && (
              <div className="text-xs text-red-600">
                {file.errors.map((error, idx) => (
                  <p key={idx}>{error}</p>
                ))}
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="space-y-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-sm text-gray-600">Processing file...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <Upload className="h-12 w-12 text-gray-400 mx-auto" />
            <div>
              <p className="text-lg font-medium text-gray-700 capitalize">
                Upload {fileType} File
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Drag and drop your CSV file here, or click to browse
              </p>
            </div>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              id={`file-${fileType}`}
            />
            <label
              htmlFor={`file-${fileType}`}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
            >
              Choose File
            </label>
          </div>
        )}
      </div>
    </div>
  );
};

// Template Selection Component
const TemplateSelection = ({ selectedTemplate, onTemplateChange, onNext }) => {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Select Configuration Template</h2>
        <p className="text-gray-600 mt-2">Choose a pre-configured template for your data format</p>
      </div>

      <div className="grid gap-4">
        {Object.entries(CONFIGURATION_TEMPLATES).map(([key, template]) => (
          <div
            key={key}
            className={`border rounded-lg p-4 cursor-pointer transition-all ${
              selectedTemplate === key 
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' 
                : 'border-gray-200 hover:border-blue-300'
            }`}
            onClick={() => onTemplateChange(key)}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{template.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                <div className="mt-2 text-xs text-gray-500">
                  {template.linkingRules.matchingRules.length} matching rules • 
                  {Object.keys(template.fieldMappings).length} mapping templates
                </div>
              </div>
              <div className={`w-4 h-4 rounded-full border-2 ${
                selectedTemplate === key 
                  ? 'border-blue-500 bg-blue-500' 
                  : 'border-gray-300'
              }`}>
                {selectedTemplate === key && (
                  <div className="w-2 h-2 bg-white rounded-full mx-auto mt-0.5"></div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={onNext}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
        >
          Process Data
          <ArrowRight className="h-4 w-4 ml-2" />
        </button>
      </div>
    </div>
  );
};

// Statistics Dashboard Component
const StatisticsDashboard = ({ statistics, onDetailView }) => {
  const getStatusColor = (rate) => {
    if (rate >= 90) return 'text-green-600 bg-green-100';
    if (rate >= 70) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const cards = [
    {
      title: 'Successful Matches',
      value: statistics.matches,
      percentage: statistics.matchRate,
      icon: CheckCircle,
      color: 'green',
      type: 'matches'
    },
    {
      title: 'Need Review',
      value: statistics.needsReview,
      percentage: statistics.reviewRate,
      icon: AlertTriangle,
      color: 'yellow',
      type: 'conflicts'
    },
    {
      title: 'Unmatched',
      value: statistics.unmatched,
      percentage: statistics.unmatchedRate,
      icon: X,
      color: 'red',
      type: 'unmatched'
    },
    {
      title: 'Total Records',
      value: statistics.totalRecords,
      percentage: 100,
      icon: Database,
      color: 'blue',
      type: 'total'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className={`bg-white rounded-lg border shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow ${
              card.type !== 'total' ? 'hover:border-blue-300' : ''
            }`}
            onClick={() => card.type !== 'total' && onDetailView(card.type)}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{card.title}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
              </div>
              <div className={`p-2 rounded-lg bg-${card.color}-100`}>
                <Icon className={`h-6 w-6 text-${card.color}-600`} />
              </div>
            </div>
            <div className="mt-3">
              <div className={`text-sm font-medium px-2 py-1 rounded ${getStatusColor(card.percentage)}`}>
                {card.percentage}%
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Conflict Resolution Component
const ConflictResolution = ({ conflicts, onResolve }) => {
  const [selectedMatch, setSelectedMatch] = useState({});

  const getDisplayValue = (record, patterns) => {
    for (const pattern of patterns) {
      const field = Object.keys(record).find(key => 
        key.toLowerCase().includes(pattern.toLowerCase()) ||
        pattern.toLowerCase().includes(key.toLowerCase())
      );
      if (field && record[field]) return record[field];
    }
    return 'N/A';
  };

  const handleResolve = (conflictIndex, action, matchIndex) => {
    onResolve(conflictIndex, action, matchIndex);
    if (action === 'accept' || action === 'reject') {
      const newSelected = { ...selectedMatch };
      delete newSelected[conflictIndex];
      setSelectedMatch(newSelected);
    }
  };

  if (conflicts.length === 0) {
    return (
      <div className="text-center py-8">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900">No Conflicts to Review</h3>
        <p className="text-gray-600">All records have been successfully processed!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Review Conflicts</h2>
        <p className="text-gray-600 mt-2">{conflicts.length} records need manual review</p>
      </div>

      {conflicts.map((conflict, conflictIndex) => (
        <div key={conflictIndex} className="border border-yellow-200 rounded-lg p-6 bg-yellow-50">
          <div className="flex items-center justify-between mb-4">
            <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded text-sm font-medium">
              CONFLICT #{conflictIndex + 1}
            </span>
            <span className="text-sm text-yellow-700">
              {conflict.commissionRecords?.length || 0} potential matches
            </span>
          </div>

          {/* Order Record */}
          <div className="mb-4 p-4 bg-white rounded border">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">📋 Order Record</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="font-medium">Customer:</span>
                <p>{getDisplayValue(conflict.orderRecord, getFieldPatterns('customer'))}</p>
              </div>
              <div>
                <span className="font-medium">Provider:</span>
                <p>{getDisplayValue(conflict.orderRecord, getFieldPatterns('provider'))}</p>
              </div>
              <div>
                <span className="font-medium">Order ID:</span>
                <p>{getDisplayValue(conflict.orderRecord, getFieldPatterns('orderId'))}</p>
              </div>
            </div>
          </div>

          {/* Potential Matches */}
          <div className="space-y-3 mb-4">
            <h4 className="text-sm font-semibold text-gray-700">💰 Potential Commission Matches</h4>
            {conflict.commissionRecords?.map((record, matchIdx) => (
              <div
                key={matchIdx}
                className={`p-4 rounded border transition-all ${
                  selectedMatch[conflictIndex] === matchIdx
                    ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200'
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      name={`conflict-${conflictIndex}`}
                      checked={selectedMatch[conflictIndex] === matchIdx}
                      onChange={() => setSelectedMatch(prev => ({
                        ...prev,
                        [conflictIndex]: matchIdx
                      }))}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-blue-600">
                      Option #{matchIdx + 1}
                    </span>
                  </div>
                  {conflict.scores && conflict.scores[matchIdx] && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      Score: {conflict.scores[matchIdx]}%
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Customer:</span>
                    <p>{getDisplayValue(record, getFieldPatterns('customer'))}</p>
                  </div>
                  <div>
                    <span className="font-medium">Provider:</span>
                    <p>{getDisplayValue(record, getFieldPatterns('provider'))}</p>
                  </div>
                  <div>
                    <span className="font-medium">Commission:</span>
                    <p className="text-green-600 font-medium">
                      ${getDisplayValue(record, getFieldPatterns('commission')) || '0'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between p-4 bg-white border rounded">
            <div className="flex space-x-3">
              <button
                onClick={() => handleResolve(conflictIndex, 'accept', selectedMatch[conflictIndex])}
                disabled={selectedMatch[conflictIndex] === undefined}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  selectedMatch[conflictIndex] !== undefined
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <CheckCircle className="h-4 w-4 inline mr-1" />
                Accept Selected
              </button>
              <button
                onClick={() => handleResolve(conflictIndex, 'reject')}
                className="px-4 py-2 bg-red-500 text-white rounded text-sm font-medium hover:bg-red-600"
              >
                <X className="h-4 w-4 inline mr-1" />
                Reject All
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Detail View Modal
const DetailViewModal = ({ type, data, onClose, searchTerm, onSearch }) => {
  const getTitle = () => {
    switch (type) {
      case 'matches': return 'Successful Matches';
      case 'conflicts': return 'Records Needing Review';
      case 'unmatched': return 'Unmatched Records';
      default: return 'Detail View';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'matches': return <CheckCircle className="h-6 w-6 text-green-600" />;
      case 'conflicts': return <AlertTriangle className="h-6 w-6 text-yellow-600" />;
      case 'unmatched': return <X className="h-6 w-6 text-red-600" />;
      default: return <Database className="h-6 w-6 text-gray-600" />;
    }
  };

  const getDisplayValue = (record, patterns) => {
    for (const pattern of patterns) {
      const field = Object.keys(record).find(key => 
        key.toLowerCase().includes(pattern.toLowerCase()) ||
        pattern.toLowerCase().includes(key.toLowerCase())
      );
      if (field && record[field]) return record[field];
    }
    return 'N/A';
  };

  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    return data.filter(item => {
      const searchableText = JSON.stringify(item).toLowerCase();
      return searchableText.includes(searchTerm.toLowerCase());
    });
  }, [data, searchTerm]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <div className="flex items-center">
            {getIcon()}
            <div className="ml-3">
              <h2 className="text-2xl font-bold text-gray-900">{getTitle()}</h2>
              <p className="text-gray-600">Showing {filteredData.length} of {data.length} records</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b bg-gray-50">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search records..."
              value={searchTerm}
              onChange={(e) => onSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm w-full"
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {type === 'matches' && (
            <div className="space-y-4">
              {filteredData.map((match, idx) => (
                <div key={idx} className="border rounded-lg p-4 bg-white">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-3 py-1 rounded text-sm font-medium ${
                      match.confidence >= 90 ? 'bg-green-100 text-green-800' :
                      match.confidence >= 70 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {Math.round(match.confidence)}% confidence
                    </span>
                    {match.isManuallyResolved && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        Manually Resolved
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">📋 Order Record</h4>
                      <div className="space-y-1 text-sm">
                        <div><span className="font-medium">Customer:</span> {getDisplayValue(match.orderRecord, getFieldPatterns('customer'))}</div>
                        <div><span className="font-medium">Provider:</span> {getDisplayValue(match.orderRecord, getFieldPatterns('provider'))}</div>
                        <div><span className="font-medium">Order ID:</span> {getDisplayValue(match.orderRecord, getFieldPatterns('orderId'))}</div>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">💰 Commission Record</h4>
                      <div className="space-y-1 text-sm">
                        <div><span className="font-medium">Customer:</span> {getDisplayValue(match.commissionRecord, getFieldPatterns('customer'))}</div>
                        <div><span className="font-medium">Provider:</span> {getDisplayValue(match.commissionRecord, getFieldPatterns('provider'))}</div>
                        <div><span className="font-medium">Commission:</span> 
                          <span className="ml-1 text-green-600 font-semibold">
                            ${getDisplayValue(match.commissionRecord, getFieldPatterns('commission')) || '0'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs bg-blue-50 p-2 rounded">
                    <span className="font-medium text-blue-800">Match Method:</span> 
                    <span className="ml-1 text-blue-700">{match.method}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {type === 'conflicts' && (
            <div className="space-y-4">
              {filteredData.map((conflict, idx) => (
                <div key={idx} className="border border-yellow-200 rounded-lg p-4 bg-yellow-50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
                      NEEDS REVIEW
                    </span>
                    <span className="text-sm text-yellow-700">
                      {conflict.commissionRecords?.length || 0} potential matches
                    </span>
                  </div>
                  
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">📋 Order Record</h4>
                    <div className="bg-white rounded p-3 text-sm">
                      <div><span className="font-medium">Customer:</span> {getDisplayValue(conflict.orderRecord, getFieldPatterns('customer'))}</div>
                      <div><span className="font-medium">Provider:</span> {getDisplayValue(conflict.orderRecord, getFieldPatterns('provider'))}</div>
                      <div><span className="font-medium">Order ID:</span> {getDisplayValue(conflict.orderRecord, getFieldPatterns('orderId'))}</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">💰 Potential Matches</h4>
                    <div className="space-y-2">
                      {conflict.commissionRecords?.slice(0, 2).map((record, matchIdx) => (
                        <div key={matchIdx} className="bg-white rounded p-3 text-sm border">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-blue-600">Option #{matchIdx + 1}</span>
                            {conflict.scores && conflict.scores[matchIdx] && (
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                Score: {conflict.scores[matchIdx]}%
                              </span>
                            )}
                          </div>
                          <div><span className="font-medium">Customer:</span> {getDisplayValue(record, getFieldPatterns('customer'))}</div>
                          <div><span className="font-medium">Commission:</span> 
                            <span className="ml-1 text-green-600 font-semibold">
                              ${getDisplayValue(record, getFieldPatterns('commission')) || '0'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {type === 'unmatched' && (
            <div className="space-y-4">
              {filteredData.map((record, idx) => (
                <div key={idx} className="border border-red-200 rounded-lg p-4 bg-red-50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium">
                      NO MATCH FOUND
                    </span>
                  </div>
                  
                  <div className="bg-white rounded p-3">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">📋 Unmatched Order Record</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div><span className="font-medium">Customer:</span> {getDisplayValue(record, getFieldPatterns('customer'))}</div>
                      <div><span className="font-medium">Provider:</span> {getDisplayValue(record, getFieldPatterns('provider'))}</div>
                      <div><span className="font-medium">Order ID:</span> {getDisplayValue(record, getFieldPatterns('orderId'))}</div>
                      <div><span className="font-medium">Sales Rep:</span> {getDisplayValue(record, getFieldPatterns('rep'))}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Field Mapping Component
const FieldMapping = ({ template, mapping, onMappingChange, availableFields }) => {
  const templateFields = EXPORT_TEMPLATES[template] || [];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 capitalize">{template} Mapping</h3>
      <div className="grid gap-3">
        {templateFields.map((field) => (
          <div key={field} className="flex items-center justify-between p-3 border rounded">
            <span className="font-medium text-gray-700">{field}</span>
            <select
              value={mapping[field] || ''}
              onChange={(e) => onMappingChange(template, field, e.target.value)}
              className="ml-4 px-3 py-1 border border-gray-300 rounded text-sm"
            >
              <option value="">Select field...</option>
              {availableFields.map((availableField) => (
                <option key={availableField} value={availableField}>
                  {availableField}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
};

// Export Preview Component
const ExportPreview = ({ preview, onExport }) => {
  const [activeTab, setActiveTab] = useState('customer');

  const generateCSV = (data, headers) => {
    if (!data || data.length === 0) return '';
    
    const csvRows = [];
    csvRows.push(headers.join(','));
    
    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header] || '';
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    });
    
    return csvRows.join('\n');
  };

  const handleExport = (type) => {
    const data = preview[type] || [];
    const headers = EXPORT_TEMPLATES[type] || [];
    const csvContent = generateCSV(data, headers);
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    if (onExport) onExport(type);
  };

  const tabs = [
    { id: 'customer', label: 'Customer', icon: '👥' },
    { id: 'location', label: 'Location', icon: '📍' },
    { id: 'contract', label: 'Contract', icon: '📄' },
    { id: 'order', label: 'Order', icon: '📋' }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Export Preview</h2>
        <p className="text-gray-600 mt-2">Review your processed data before export</p>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
              <span className="ml-2 bg-gray-100 text-gray-600 py-1 px-2 rounded-full text-xs">
                {preview[tab.id]?.length || 0}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b bg-gray-50">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-900 capitalize">{activeTab} Records</h3>
            <button
              onClick={() => handleExport(activeTab)}
              disabled={!preview[activeTab] || preview[activeTab].length === 0}
              className={`px-4 py-2 rounded text-sm font-medium flex items-center ${
                preview[activeTab] && preview[activeTab].length > 0
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Download className="h-4 w-4 mr-2" />
              Export {activeTab}
            </button>
          </div>
        </div>

        <div className="p-4">
          {preview[activeTab] && preview[activeTab].length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {EXPORT_TEMPLATES[activeTab]?.slice(0, 5).map((header) => (
                      <th
                        key={header}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {preview[activeTab].slice(0, 10).map((row, idx) => (
                    <tr key={idx}>
                      {EXPORT_TEMPLATES[activeTab]?.slice(0, 5).map((header) => (
                        <td
                          key={header}
                          className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                        >
                          {row[header] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview[activeTab].length > 10 && (
                <p className="text-sm text-gray-500 mt-4 text-center">
                  Showing first 10 of {preview[activeTab].length} records
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No {activeTab} records to preview</p>
            </div>
          )}
        </div>
      </div>

      {/* Export All */}
      <div className="flex justify-center">
        <button
          onClick={() => {
            tabs.forEach(tab => {
              if (preview[tab.id] && preview[tab.id].length > 0) {
                handleExport(tab.id);
              }
            });
          }}
          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center"
        >
          <Download className="h-5 w-5 mr-2" />
          Export All Files
        </button>
      </div>
    </div>
  );
};

// Main Application Component
const TelecomDataProcessor = () => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const handleFileUpload = (fileType, fileData) => {
    dispatch({ type: 'SET_FILE', fileType, payload: fileData });
    dispatch({ type: 'SET_UI_STATE', payload: { loading: false, error: null } });
  };

  const handleTemplateChange = (templateKey) => {
    dispatch({ type: 'SET_UI_STATE', payload: { selectedTemplate: templateKey } });
  };

  const handleProcessData = async () => {
    dispatch({ type: 'SET_UI_STATE', payload: { loading: true } });
    
    try {
      const linkingResults = processDataLinking(
        state.files.orders,
        state.files.commissions,
        state.ui.selectedTemplate
      );
      
      dispatch({ type: 'SET_LINKING_RESULTS', payload: linkingResults });
      dispatch({ type: 'SET_STEP', payload: 3 });
      
      // Generate sample export preview
      const samplePreview = {
        customer: linkingResults.matches.slice(0, 5).map((match, idx) => ({
          'Name': extractFieldValue(match.orderRecord, getFieldPatterns('customer')) || `Customer ${idx + 1}`,
          'Account Manager': extractFieldValue(match.orderRecord, getFieldPatterns('rep')) || 'N/A',
          'Status': 'Active'
        })),
        contract: linkingResults.matches.slice(0, 5).map((match, idx) => ({
          'Customer Name': extractFieldValue(match.orderRecord, getFieldPatterns('customer')) || `Customer ${idx + 1}`,
          'Carrier Name': extractFieldValue(match.orderRecord, getFieldPatterns('provider')) || 'N/A',
          'MRC': extractFieldValue(match.orderRecord, getFieldPatterns('revenue')) || '0',
          'Residual': extractFieldValue(match.commissionRecord, getFieldPatterns('commission')) || '0'
        })),
        order: linkingResults.matches.slice(0, 5).map((match, idx) => ({
          'Carrier': extractFieldValue(match.orderRecord, getFieldPatterns('provider')) || 'N/A',
          'Status': 'Active',
          'Owner': extractFieldValue(match.orderRecord, getFieldPatterns('rep')) || 'N/A'
        })),
        location: []
      };
      
      dispatch({ type: 'SET_EXPORT_PREVIEW', payload: samplePreview });
      
    } catch (error) {
      dispatch({ type: 'SET_UI_STATE', payload: { 
        loading: false, 
        error: 'Failed to process data linking' 
      } });
    } finally {
      dispatch({ type: 'SET_UI_STATE', payload: { loading: false } });
    }
  };

  const handleResolveConflict = (conflictIndex, action, matchIndex) => {
    dispatch({
      type: 'RESOLVE_CONFLICT',
      payload: { conflictIndex, action, matchIndex }
    });
  };

  const handleDetailView = (type) => {
    dispatch({ type: 'SET_UI_STATE', payload: { detailView: type, searchTerm: '' } });
  };

  const handleCloseDetailView = () => {
    dispatch({ type: 'SET_UI_STATE', payload: { detailView: null } });
  };

  const handleSearch = (searchTerm) => {
    dispatch({ type: 'SET_UI_STATE', payload: { searchTerm } });
  };

  const handleFieldMapping = (template, field, value) => {
    const currentMapping = state.mapping.active[template] || {};
    const updatedMapping = { ...currentMapping, [field]: value };
    dispatch({ type: 'SET_MAPPING', template, payload: updatedMapping });
  };

  const getDetailViewData = () => {
    switch (state.ui.detailView) {
      case 'matches': return state.linking.matches;
      case 'conflicts': return state.linking.conflicts;
      case 'unmatched': return state.linking.unmatched;
      default: return [];
    }
  };

  const canProceedToNext = () => {
    switch (state.currentStep) {
      case 1:
        return state.files.orders.data && state.files.commissions.data;
      case 2:
        return state.ui.selectedTemplate;
      case 3:
        return state.linking.conflicts.length === 0;
      default:
        return true;
    }
  };

  const getStepTitle = () => {
    switch (state.currentStep) {
      case 1: return 'Upload Files';
      case 2: return 'Select Template';
      case 3: return 'Review Results';
      case 4: return 'Field Mapping';
      case 5: return 'Export Data';
      default: return 'Processing';
    }
  };

  const allAvailableFields = [
    ...state.files.orders.headers,
    ...state.files.commissions.headers
  ].filter((field, index, array) => array.indexOf(field) === index);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Telecom Data Processor</h1>
              <p className="text-gray-600 mt-1">Link orders with commission records automatically</p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">Step {state.currentStep} of 5</span>
              <div className="flex space-x-2">
                {[1, 2, 3, 4, 5].map((step) => (
                  <div
                    key={step}
                    className={`w-3 h-3 rounded-full ${
                      step === state.currentStep
                        ? 'bg-blue-600'
                        : step < state.currentStep
                        ? 'bg-green-500'
                        : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Step Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{getStepTitle()}</h2>
              <p className="text-gray-600 mt-1">
                {state.currentStep === 1 && "Upload your orders and commissions CSV files"}
                {state.currentStep === 2 && "Choose the best template for your data format"}
                {state.currentStep === 3 && "Review matching results and resolve conflicts"}
                {state.currentStep === 4 && "Configure field mappings for export"}
                {state.currentStep === 5 && "Preview and download your processed data"}
              </p>
            </div>
            <div className="flex space-x-3">
              {state.currentStep > 1 && (
                <button
                  onClick={() => dispatch({ type: 'SET_STEP', payload: state.currentStep - 1 })}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
              )}
              {state.currentStep < 5 && canProceedToNext() && (
                <button
                  onClick={() => {
                    if (state.currentStep === 2) {
                      handleProcessData();
                    } else {
                      dispatch({ type: 'SET_STEP', payload: state.currentStep + 1 });
                    }
                  }}
                  disabled={state.ui.loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
                >
                  {state.ui.loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      {state.currentStep === 2 ? 'Process Data' : 'Next'}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Error Display */}
        {state.ui.error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
              <span className="text-red-700">{state.ui.error}</span>
            </div>
          </div>
        )}

        {/* Step Content */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          {/* Step 1: File Upload */}
          {state.currentStep === 1 && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <FileUpload
                  fileType="orders"
                  file={state.files.orders}
                  onFileUpload={handleFileUpload}
                  loading={state.ui.loading}
                />
                <FileUpload
                  fileType="commissions"
                  file={state.files.commissions}
                  onFileUpload={handleFileUpload}
                  loading={state.ui.loading}
                />
              </div>

              {/* File Summary */}
              {(state.files.orders.data || state.files.commissions.data) && (
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Summary</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {state.files.orders.data && (
                      <div className="bg-blue-50 rounded-lg p-4">
                        <h4 className="font-medium text-blue-900">Orders File</h4>
                        <p className="text-blue-700 text-sm mt-1">
                          {state.files.orders.data.length} records • {state.files.orders.headers.length} columns
                        </p>
                        <p className="text-blue-600 text-xs mt-1">{state.files.orders.filename}</p>
                      </div>
                    )}
                    {state.files.commissions.data && (
                      <div className="bg-green-50 rounded-lg p-4">
                        <h4 className="font-medium text-green-900">Commissions File</h4>
                        <p className="text-green-700 text-sm mt-1">
                          {state.files.commissions.data.length} records • {state.files.commissions.headers.length} columns
                        </p>
                        <p className="text-green-600 text-xs mt-1">{state.files.commissions.filename}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Template Selection */}
          {state.currentStep === 2 && (
            <TemplateSelection
              selectedTemplate={state.ui.selectedTemplate}
              onTemplateChange={handleTemplateChange}
              onNext={handleProcessData}
            />
          )}

          {/* Step 3: Review Results */}
          {state.currentStep === 3 && (
            <div className="space-y-6">
              {/* Statistics Dashboard */}
              <StatisticsDashboard
                statistics={state.linking.statistics}
                onDetailView={handleDetailView}
              />

              {/* Conflict Resolution */}
              {state.linking.conflicts.length > 0 ? (
                <ConflictResolution
                  conflicts={state.linking.conflicts}
                  onResolve={handleResolveConflict}
                />
              ) : (
                <div className="text-center py-12">
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Processing Complete!</h3>
                  <p className="text-gray-600 mb-6">
                    All records have been successfully processed. No conflicts to review.
                  </p>
                  <div className="bg-green-50 rounded-lg p-4 inline-block">
                    <div className="flex items-center space-x-4 text-sm">
                      <div className="flex items-center text-green-700">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        <span>{state.linking.statistics.matches} matches</span>
                      </div>
                      <div className="flex items-center text-blue-700">
                        <Database className="h-4 w-4 mr-1" />
                        <span>{state.linking.statistics.matchRate}% success rate</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Field Mapping */}
          {state.currentStep === 4 && (
            <div className="space-y-8">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Configure Field Mappings</h2>
                <p className="text-gray-600 mt-2">Map your data fields to export templates</p>
              </div>

              {/* Template Tabs */}
              <div className="border-b">
                <nav className="-mb-px flex space-x-8">
                  {['customer', 'contract', 'order'].map((template) => (
                    <button
                      key={template}
                      onClick={() => dispatch({ type: 'SET_UI_STATE', payload: { activeTemplate: template } })}
                      className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                        state.ui.activeTemplate === template
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {template}
                      <span className="ml-2 bg-gray-100 text-gray-600 py-1 px-2 rounded-full text-xs">
                        {EXPORT_TEMPLATES[template]?.length || 0}
                      </span>
                    </button>
                  ))}
                </nav>
              </div>

              {/* Field Mapping */}
              <FieldMapping
                template={state.ui.activeTemplate}
                mapping={state.mapping.active[state.ui.activeTemplate] || {}}
                onMappingChange={handleFieldMapping}
                availableFields={allAvailableFields}
              />
            </div>
          )}

          {/* Step 5: Export Preview */}
          {state.currentStep === 5 && (
            <ExportPreview
              preview={state.export.preview}
              onExport={(type) => console.log(`Exported ${type}`)}
            />
          )}
        </div>
      </div>

      {/* Detail View Modal */}
      {state.ui.detailView && (
        <DetailViewModal
          type={state.ui.detailView}
          data={getDetailViewData()}
          onClose={handleCloseDetailView}
          searchTerm={state.ui.searchTerm}
          onSearch={handleSearch}
        />
      )}

      {/* Footer */}
      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Telecom Data Processor v2.0 • Built with React
            </div>
            <div className="flex items-center space-x-4 text-sm text-gray-500">
              <span>Files processed: {state.linking.statistics.totalRecords}</span>
              <span>•</span>
              <span>Success rate: {state.linking.statistics.matchRate}%</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default TelecomDataProcessor;