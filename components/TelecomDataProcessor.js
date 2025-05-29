'use client';

// == IMPORTS ==

import React, { useState, useEffect, useContext, createContext, useReducer, useMemo } from 'react';
import { Upload, FileText, Link, Download, CheckCircle, AlertTriangle, X, Settings, Save, FolderOpen, Eye, ArrowRight, Database, Zap, Edit3, Plus, Trash2, Copy } from 'lucide-react';

// == CONSTANTS ==

// Enhanced Configuration Templates with complete mappings
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
      location: {
        "Customer": { source: "orders", field: "Customer", transform: "normalize" },
        "Location Name": { source: "orders", field: "Location", transform: "normalize" },
        "Address One": { source: "orders", field: "Location", transform: "normalize" },
        "Status": { source: "orders", field: "Milestone Name", transform: "normalize" }
      },
      contract: {
        "Customer Name": { source: "orders", field: "Customer", transform: "normalize" },
        "Carrier Name": { source: "orders", field: "Provider", transform: "normalize" },
        "Service Name(s)": { source: "orders", field: "Product", transform: "normalize" },
        "MRC": { source: "orders", field: "MRGMV", transform: "currency" },
        "NRC": { source: "orders", field: "NRC", transform: "currency" },
        "Residual": { source: "commissions", field: "Comp Paid", transform: "currency" },
        "Status": { source: "orders", field: "Milestone Name", transform: "normalize" }
      },
      order: {
        "Carrier": { source: "orders", field: "Provider", transform: "normalize" },
        "Service": { source: "orders", field: "Product", transform: "normalize" },
        "Status": { source: "orders", field: "Milestone Name", transform: "normalize" },
        "Owner": { source: "orders", field: "Sales Rep", transform: "titleCase" },
        "Account Number": { source: "orders", field: "Billing Account Number", transform: "normalize" },
        "Product Description": { source: "orders", field: "Product", transform: "normalize" }
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
        "Address One": { source: "orders", field: "Location Address", transform: "normalize" },
        "City": { source: "commissions", field: "City", transform: "titleCase" },
        "State": { source: "commissions", field: "State", transform: "upperCase" },
        "Postal Code": { source: "commissions", field: "Zip", transform: "normalize" }
      },
      contract: {
        "Customer Name": { source: "orders", field: "Customer", transform: "normalize" },
        "Carrier Name": { source: "orders", field: "Supplier", transform: "normalize" },
        "MRC": { source: "orders", field: "Total Estimated MRC", transform: "currency" },
        "NRC": { source: "orders", field: "Total Estimated NRC", transform: "currency" },
        "Initial Term": { source: "orders", field: "Term Length", transform: "normalize" }
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
        "Address One": { source: "orders", field: "Street Address", transform: "normalize" },
        "City": { source: "orders", field: "City", transform: "titleCase" },
        "State": { source: "orders", field: "State", transform: "upperCase" },
        "Postal Code": { source: "orders", field: "ZIP", transform: "normalize" }
      },
      contract: {
        "Customer Name": { source: "orders", field: "Customer Name", transform: "normalize" },
        "Status": { source: "orders", field: "Service Status", transform: "normalize" }
      }
    }
  },
  avant: {
    name: "Avant RPM",
    description: "Configuration for Avant RPM orders and commissions",
    linkingRules: {
      strategy: "multi_criteria",
      matchingRules: [
        { ordersField: "Account", commissionsField: "Acct #", matchType: "exact", fuzzyThreshold: 0.85 },
        { ordersField: "Customer", commissionsField: "Customer", matchType: "fuzzy", fuzzyThreshold: 0.85 },
        { ordersField: "Provider", commissionsField: "Provider", matchType: "fuzzy", fuzzyThreshold: 0.8 }
      ]
    },
    fieldMappings: {
      customer: {
        "Name": { source: "commissions", field: "Customer", transform: "normalize" },
        "Account Manager": { source: "commissions", field: "Rep", transform: "titleCase" },
        "Address One": { source: "orders", field: "Address", transform: "normalize" },
        "City": { source: "orders", field: "City", transform: "titleCase" },
        "State": { source: "orders", field: "State", transform: "upperCase" },
        "Postal Code": { source: "orders", field: "Zip", transform: "normalize" }
      },
      location: {
        "Customer": { source: "commissions", field: "Customer", transform: "normalize" },
        "Address One": { source: "orders", field: "Address", transform: "normalize" },
        "City": { source: "orders", field: "City", transform: "titleCase" },
        "State": { source: "orders", field: "State", transform: "upperCase" },
        "Postal Code": { source: "orders", field: "Zip", transform: "normalize" },
        "Location Name": { source: "orders", field: "Location Description", transform: "normalize" }
      },
      contract: {
        "Customer Name": { source: "commissions", field: "Customer", transform: "normalize" },
        "Carrier Name": { source: "commissions", field: "Provider", transform: "normalize" },
        "Service Name(s)": { source: "orders", field: "Product", transform: "normalize" },
        "MRC": { source: "commissions", field: "Net Billed", transform: "currency" },
        "Residual": { source: "commissions", field: "Sales Commission", transform: "currency" },
        "Date Signed": { source: "orders", field: "Contract Start Date", transform: "date" },
        "Initial Term": { source: "orders", field: "Contract Term", transform: "normalize" }
      },
      order: {
        "Carrier": { source: "commissions", field: "Provider", transform: "normalize" },
        "Service": { source: "orders", field: "Product", transform: "normalize" },
        "Status": { source: "orders", field: "Type", transform: "normalize" },
        "Owner": { source: "commissions", field: "Rep", transform: "titleCase" },
        "Account Number": { source: "commissions", field: "Acct #", transform: "normalize" },
        "Install Date": { source: "orders", field: "Install Date", transform: "date" },
        "Product Description": { source: "orders", field: "Product Description", transform: "normalize" }
      }
    }
  },
  ibs: {
    name: "IBS Standard",
    description: "Configuration for IBS orders and commissions",
    linkingRules: {
      strategy: "multi_criteria",
      matchingRules: [
        { ordersField: "Account", commissionsField: "Account", matchType: "exact", fuzzyThreshold: 0.85 },
        { ordersField: "Customer Name", commissionsField: "Customer", matchType: "fuzzy", fuzzyThreshold: 0.85 },
        { ordersField: "Service Provider", commissionsField: "Supplier", matchType: "fuzzy", fuzzyThreshold: 0.8 }
      ]
    },
    fieldMappings: {
      customer: {
        "Name": { source: "orders", field: "Customer Name", transform: "normalize" },
        "Account Manager": { source: "orders", field: "Rep Name", transform: "titleCase" },
        "Address One": { source: "orders", field: "Address", transform: "normalize" },
        "Address Two": { source: "orders", field: "Address Line 2", transform: "normalize" },
        "City": { source: "orders", field: "City", transform: "titleCase" },
        "State": { source: "orders", field: "State", transform: "upperCase" },
        "Postal Code": { source: "orders", field: "Zip Code", transform: "normalize" }
      },
      location: {
        "Customer": { source: "orders", field: "Customer Name", transform: "normalize" },
        "Location Name": { source: "orders", field: "Location Name", transform: "normalize" },
        "Address One": { source: "orders", field: "Address", transform: "normalize" },
        "Address Two": { source: "orders", field: "Address Line 2", transform: "normalize" },
        "City": { source: "orders", field: "City", transform: "titleCase" },
        "State": { source: "orders", field: "State", transform: "upperCase" },
        "Postal Code": { source: "orders", field: "Zip Code", transform: "normalize" }
      },
      contract: {
        "Customer Name": { source: "orders", field: "Customer Name", transform: "normalize" },
        "Carrier Name": { source: "orders", field: "Service Provider", transform: "normalize" },
        "Service Name(s)": { source: "orders", field: "Products Sold", transform: "normalize" },
        "MRC": { source: "orders", field: "MRC", transform: "currency" },
        "Date Signed": { source: "orders", field: "Contract Sign Date", transform: "date" },
        "Initial Term": { source: "orders", field: "Contract Term", transform: "normalize" },
        "Residual": { source: "commissions", field: "Sales comm.", transform: "currency" },
        "Status": { source: "orders", field: "Status", transform: "normalize" }
      },
      order: {
        "Carrier": { source: "orders", field: "Service Provider", transform: "normalize" },
        "Service": { source: "orders", field: "Products Sold", transform: "normalize" },
        "Status": { source: "orders", field: "Status", transform: "normalize" },
        "Owner": { source: "orders", field: "Rep Name", transform: "titleCase" },
        "Install Date": { source: "orders", field: "Install Date", transform: "date" },
        "Product Description": { source: "orders", field: "Products Sold", transform: "normalize" }
      }
    }
  },
  sandler: {
    name: "Sandler Standard",
    description: "Configuration for Sandler orders and commissions",
    linkingRules: {
      strategy: "cross_file",
      matchingRules: [
        { ordersField: "Sandler Order #", commissionsField: "Account #", matchType: "exact", fuzzyThreshold: 0.85 },
        { ordersField: "Customer", commissionsField: "Customer", matchType: "fuzzy", fuzzyThreshold: 0.85 },
        { ordersField: "Provider", commissionsField: "Rep", matchType: "fuzzy", fuzzyThreshold: 0.9 }
      ]
    },
    fieldMappings: {
      customer: {
        "Name": { source: "orders", field: "Customer", transform: "normalize" },
        "Account Manager": { source: "commissions", field: "Rep", transform: "titleCase" },
        "Address One": { source: "orders", field: "Address", transform: "normalize" },
        "City": { source: "orders", field: "City", transform: "titleCase" },
        "State": { source: "orders", field: "State", transform: "upperCase" },
        "Postal Code": { source: "orders", field: "ZIP Code", transform: "normalize" }
      },
      location: {
        "Customer": { source: "orders", field: "Customer", transform: "normalize" },
        "Address One": { source: "orders", field: "Address", transform: "normalize" },
        "City": { source: "orders", field: "City", transform: "titleCase" },
        "State": { source: "orders", field: "State", transform: "upperCase" },
        "Postal Code": { source: "orders", field: "ZIP Code", transform: "normalize" }
      },
      contract: {
        "Customer Name": { source: "orders", field: "Customer", transform: "normalize" },
        "Carrier Name": { source: "orders", field: "Provider", transform: "normalize" },
        "MRC": { source: "orders", field: "Contract MRC", transform: "currency" },
        "Date Signed": { source: "orders", field: "Contract Sign Date", transform: "date" },
        "Initial Term": { source: "orders", field: "Contract Terms (Months)", transform: "normalize" },
        "Residual": { source: "commissions", field: "Agent comm.", transform: "currency" },
        "Status": { source: "orders", field: "Status", transform: "normalize" }
      },
      order: {
        "Carrier": { source: "orders", field: "Provider", transform: "normalize" },
        "Status": { source: "orders", field: "Status", transform: "normalize" },
        "Owner": { source: "commissions", field: "Rep", transform: "titleCase" },
        "Account Number": { source: "commissions", field: "Account #", transform: "normalize" },
        "Install Date": { source: "commissions", field: "Install Date", transform: "date" },
        "Product Description": { source: "commissions", field: "Product", transform: "normalize" }
      }
    }
  }
};

const FIELD_SYNONYMS = {
  customer: ['Customer', 'Customer Name', 'Provider Customer Name', 'Client', 'Company Name'],
  account: ['Account', 'Account Number', 'Account #', 'Acct #', 'Provider Account #', 'Billing Account Number'],
  rep: ['Rep', 'Sales Rep', 'Rep Name', 'Advisor', 'Agent', 'Sales Rep Name', 'Account Manager'],
  provider: ['Provider', 'Supplier', 'Carrier', 'Service Provider', 'Provider Name', 'Carrier Name'],
  revenue: ['Revenue', 'Net Billed', 'MRC', 'Monthly Recurring Revenue', 'Amount', 'Contract MRC'],
  commission: ['Commission', 'Sales Comm.', 'Agent comm.', 'Comp Paid', 'Commission Amount'],
  address: ['Address', 'Site Address', 'Provider Site Address', 'Service Address', 'Location Address'],
  installDate: ['Install Date', 'Installation Date', 'Service Date', 'Activation Date', 'Begin Service Date'],
  orderDate: ['Order Date', 'Sale Date', 'Contract Sign Date', 'Date Signed', 'Order Received']
};

// Export Templates
const EXPORT_TEMPLATES = {
  customer: [
    'Partner ID', 'Parent ID', 'Customer Type', 'Account Manager', 'Status', 'Name', 
    'Primary Contact', 'Primary Contact Phone', 'Primary Contact Email', 'Address One', 
    'Address Two', 'City', 'State', 'Postal Code', 'Country'
  ],
  location: [
    'Customer', 'Location Name', 'Location Type', 'Status', 'Address One', 'Address Two', 
    'City', 'State', 'Postal Code', 'Country', 'Primary Name', 'Primary Phone', 'Primary Email'
  ],
  contract: [
    'Partner Name', 'Customer Name', 'Location ID(s)', 'Carrier Name', 'Service Name(s)', 
    'Date Signed', 'Status', 'Owner', 'Type', 'Initial Term', 'MRC', 'NRC', 'Residual'
  ],
  order: [
    'Carrier', 'Service', 'Status', 'Owner', 'Install Date', 'Account Number', 
    'Product Description', 'Circuit ID', 'Bill To'
  ]
};

// == CONTEXT & REDUCER ==

// App State Context
const AppStateContext = createContext();

// Initial state
const initialState = {
  currentStep: 1,
  files: {
    orders: { data: null, headers: [], filename: '', errors: [] },
    commissions: { data: null, headers: [], filename: '', errors: [] }
  },
  linking: {
    matches: [],
    conflicts: [],
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
    showTemplateEditor: false,
    editingTemplate: null,
    customTemplates: {}
  }
};

// Reducer
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
    case 'UPDATE_TEMPLATE':
      return {
        ...state,
        ui: {
          ...state.ui,
          customTemplates: {
            ...state.ui.customTemplates,
            [action.templateKey]: action.template
          }
        }
      };
    case 'RESOLVE_CONFLICT':
      const { conflictIndex, action: resolutionAction, matchIndex } = action.payload;
      const updatedConflicts = [...state.linking.conflicts];
      const resolvedConflict = updatedConflicts[conflictIndex];
      
      if (resolutionAction === 'accept' && matchIndex !== undefined) {
        // Move the accepted match to the matches array
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
              needsReview: updatedConflicts.length,
              matchRate: Math.round((updatedMatches.length / state.linking.statistics.totalRecords) * 100),
              reviewRate: Math.round((updatedConflicts.length / state.linking.statistics.totalRecords) * 100)
            }
          }
        };
      } else if (resolutionAction === 'reject') {
        // Remove the conflict (mark as manually rejected)
        updatedConflicts.splice(conflictIndex, 1);
        
        return {
          ...state,
          linking: {
            ...state.linking,
            conflicts: updatedConflicts,
            statistics: {
              ...state.linking.statistics,
              needsReview: updatedConflicts.length,
              reviewRate: Math.round((updatedConflicts.length / state.linking.statistics.totalRecords) * 100)
            }
          }
        };
      }
      return state;
    default:
      return state;
  }
}

// == UTILS ==

const parseCSV = (csvText) => {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return { headers: [], data: [] };
  
  // Proper CSV parsing that handles quoted fields with commas
  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Handle escaped quotes ("")
          current += '"';
          i += 2;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator found outside quotes
        result.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    
    // Add the last field
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

const findFieldMatches = (targetField, availableFields) => {
  // Exact match
  const exactMatch = availableFields.find(field => 
    field.toLowerCase() === targetField.toLowerCase()
  );
  if (exactMatch) return { field: exactMatch, confidence: 100 };
  
  // Synonym match
  const synonyms = FIELD_SYNONYMS[targetField.toLowerCase()] || [];
  for (const synonym of synonyms) {
    const synonymMatch = availableFields.find(field =>
      field.toLowerCase() === synonym.toLowerCase()
    );
    if (synonymMatch) return { field: synonymMatch, confidence: 95 };
  }
  
  // Fuzzy match (simplified)
  const fuzzyMatches = availableFields.filter(field =>
    field.toLowerCase().includes(targetField.toLowerCase()) ||
    targetField.toLowerCase().includes(field.toLowerCase())
  );
  
  if (fuzzyMatches.length > 0) {
    return { field: fuzzyMatches[0], confidence: 75 };
  }
  
  return null;
};

const linkRecords = (ordersData, commissionsData, linkingRules) => {
  const matches = [];
  const conflicts = [];
  const unmatched = [];
  
  // Helper function for fuzzy string matching
  const fuzzyMatch = (str1, str2, threshold = 0.8) => {
    if (!str1 || !str2) return false;
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    // Exact match
    if (s1 === s2) return true;
    
    // Contains match
    if (s1.includes(s2) || s2.includes(s1)) return true;
    
    // Simple similarity check
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    const editDistance = [...shorter].reduce((acc, char, i) => 
      acc + (longer[i] !== char ? 1 : 0), 0);
    
    return (1 - editDistance / longer.length) >= threshold;
  };

  // Enhanced linking logic using matching rules
  const tryMatchingRules = (order, commission, matchingRules) => {
    let totalScore = 0;
    const reasons = [];
    
    if (!matchingRules || matchingRules.length === 0) {
      // Fallback to legacy matching for backwards compatibility
      return tryLegacyMatching(order, commission);
    }
    
    for (const rule of matchingRules) {
      const orderValue = order[rule.ordersField];
      const commissionValue = commission[rule.commissionsField];
      
      if (!orderValue || !commissionValue) continue;
      
      let matches = false;
      let score = 0;
      
      if (rule.matchType === 'exact') {
        if (String(orderValue).trim() === String(commissionValue).trim()) {
          matches = true;
          score = 100;
        }
      } else if (rule.matchType === 'fuzzy') {
        if (fuzzyMatch(orderValue, commissionValue, rule.fuzzyThreshold)) {
          matches = true;
          score = Math.round(rule.fuzzyThreshold * 100);
        }
      }
      
      if (matches) {
        totalScore += score;
        reasons.push(`${rule.ordersField}↔${rule.commissionsField} (${rule.matchType})`);
      }
    }
    
    return totalScore > 0 ? { score: Math.min(totalScore, 100), reasons: reasons.join(', ') } : null;
  };
  
  // Legacy matching function for backwards compatibility
  const tryLegacyMatching = (order, commission) => {
    let score = 0;
    const reasons = [];
    
    // Try Order ID exact match
    if (order['Order ID'] && commission['Order ID'] && 
        String(order['Order ID']) === String(commission['Order ID'])) {
      score += 100;
      reasons.push('Order ID exact match');
    }
    
    // Try customer name matching
    if (order.Customer && commission.Customer) {
      if (fuzzyMatch(order.Customer, commission.Customer, 0.9)) {
        score += 50;
        reasons.push('Customer name match');
      }
    }
    
    // Try provider matching
    if (order.Provider && commission['Provider Name']) {
      if (fuzzyMatch(order.Provider, commission['Provider Name'], 0.8)) {
        score += 30;
        reasons.push('Provider match');
      }
    }
    
    return score > 0 ? { score: Math.min(score, 100), reasons: reasons.join(', ') } : null;
  };
  
  // Try matching each order record
  ordersData.forEach(order => {
    const potentialMatches = [];
    
    commissionsData.forEach(commission => {
      const matchResult = tryMatchingRules(order, commission, linkingRules.matchingRules);
      
      if (matchResult && matchResult.score >= 30) { // Minimum threshold for consideration
        potentialMatches.push({
          commission,
          score: matchResult.score,
          reasons: matchResult.reasons
        });
      }
    });
    
    // Sort by score and determine best match
    potentialMatches.sort((a, b) => b.score - a.score);
    
    if (potentialMatches.length === 0) {
      unmatched.push(order);
    } else if (potentialMatches.length === 1 || potentialMatches[0].score >= 70) {
      // Clear winner or high confidence match
      const bestMatch = potentialMatches[0];
      matches.push({
        orderRecord: order,
        commissionRecord: bestMatch.commission,
        confidence: Math.min(bestMatch.score, 100),
        method: bestMatch.reasons,
        matchScore: bestMatch.score
      });
    } else if (potentialMatches[0].score - potentialMatches[1].score >= 20) {
      // Significant score difference, take the best
      const bestMatch = potentialMatches[0];
      matches.push({
        orderRecord: order,
        commissionRecord: bestMatch.commission,
        confidence: Math.min(bestMatch.score * 0.8, 100),
        method: bestMatch.reasons + ' (best of multiple)',
        matchScore: bestMatch.score
      });
    } else {
      // Multiple similar matches - conflict
      conflicts.push({
        orderRecord: order,
        commissionRecords: potentialMatches.slice(0, 3).map(m => m.commission),
        scores: potentialMatches.slice(0, 3).map(m => m.score),
        issue: 'multiple_similar_matches'
      });
    }
  });
  
  return {
    matches,
    conflicts,
    unmatched,
    statistics: {
      totalRecords: ordersData.length,
      totalCommissionRecords: commissionsData.length,
      matches: matches.length,
      needsReview: conflicts.length,
      unmatched: unmatched.length,
      matchRate: Math.round((matches.length / ordersData.length) * 100),
      reviewRate: Math.round((conflicts.length / ordersData.length) * 100),
      unmatchedRate: Math.round((unmatched.length / ordersData.length) * 100)
    }
  };
};

// Template Detection Logic
const detectBestTemplate = (ordersFile, commissionsFile) => {
  const allFilenames = [ordersFile.filename, commissionsFile.filename].join(' ').toLowerCase();
  const allHeaders = [...ordersFile.headers, ...commissionsFile.headers].join(' ').toLowerCase();
  
  // Detection rules based on filename patterns and field analysis
  const detectionRules = [
    {
      templateKey: 'appdirect',
      confidence: 0,
      checks: [
        { type: 'filename', pattern: /appdirect/i, weight: 50 },
        { type: 'header', pattern: /advisor.*id|legacy.*advisor/i, weight: 30 },
        { type: 'header', pattern: /provider.*customer.*name/i, weight: 20 },
        { type: 'header', pattern: /comp.*paid/i, weight: 15 }
      ]
    },
    {
      templateKey: 'intelisys',
      confidence: 0,
      checks: [
        { type: 'filename', pattern: /intelisys/i, weight: 50 },
        { type: 'header', pattern: /rpm.*order/i, weight: 40 },
        { type: 'header', pattern: /supplier/i, weight: 20 },
        { type: 'header', pattern: /location.*number/i, weight: 15 }
      ]
    },
    {
      templateKey: 'windstream',
      confidence: 0,
      checks: [
        { type: 'filename', pattern: /windstream/i, weight: 50 },
        { type: 'header', pattern: /accountnbr/i, weight: 30 },
        { type: 'header', pattern: /custfname|custlname/i, weight: 25 },
        { type: 'header', pattern: /phonenbr/i, weight: 15 }
      ]
    },
    {
      templateKey: 'avant',
      confidence: 0,
      checks: [
        { type: 'filename', pattern: /avant/i, weight: 50 },
        { type: 'header', pattern: /acct.*#/i, weight: 25 },
        { type: 'header', pattern: /net.*billed/i, weight: 20 },
        { type: 'header', pattern: /sales.*commission/i, weight: 20 },
        { type: 'header', pattern: /assignment.*code/i, weight: 15 },
        { type: 'header', pattern: /run.*month/i, weight: 10 }
      ]
    },
    {
      templateKey: 'ibs',
      confidence: 0,
      checks: [
        { type: 'filename', pattern: /ibs/i, weight: 50 },
        { type: 'header', pattern: /rep.*name/i, weight: 25 },
        { type: 'header', pattern: /customer.*name/i, weight: 20 },
        { type: 'header', pattern: /service.*provider/i, weight: 20 },
        { type: 'header', pattern: /products.*sold/i, weight: 15 },
        { type: 'header', pattern: /bandwidth.*type/i, weight: 10 }
      ]
    },
    {
      templateKey: 'sandler',
      confidence: 0,
      checks: [
        { type: 'filename', pattern: /sandler/i, weight: 50 },
        { type: 'header', pattern: /sandler.*order/i, weight: 40 },
        { type: 'header', pattern: /contract.*mrc/i, weight: 25 },
        { type: 'header', pattern: /contract.*terms.*months/i, weight: 20 },
        { type: 'header', pattern: /provider.*account/i, weight: 15 },
        { type: 'header', pattern: /agent.*comm/i, weight: 15 }
      ]
    }
  ];
  
  // Calculate confidence scores
  detectionRules.forEach(rule => {
    rule.checks.forEach(check => {
      const searchText = check.type === 'filename' ? allFilenames : allHeaders;
      if (check.pattern.test(searchText)) {
        rule.confidence += check.weight;
      }
    });
  });
  
  // Sort by confidence and return best match
  detectionRules.sort((a, b) => b.confidence - a.confidence);
  const bestMatch = detectionRules[0];
  
  return {
    templateKey: bestMatch.confidence > 30 ? bestMatch.templateKey : null,
    confidence: bestMatch.confidence,
    allScores: detectionRules.map(r => ({ 
      template: r.templateKey, 
      confidence: r.confidence 
    }))
  };
};

// == COMPONENTS ==

// Template Editor Component
const TemplateEditor = ({ template, templateKey, onSave, onCancel, availableFields }) => {
  const [editedTemplate, setEditedTemplate] = useState(JSON.parse(JSON.stringify(template)));
  const [activeTab, setActiveTab] = useState('general');
  const [errors, setErrors] = useState({});

  const validateTemplate = () => {
    const newErrors = {};
    
    if (!editedTemplate.name.trim()) {
      newErrors.name = 'Template name is required';
    }
    
    // Check that at least one matching rule is configured
    const matchingRules = editedTemplate.linkingRules.matchingRules || [];
    if (matchingRules.length === 0) {
      newErrors.matchingRules = 'At least one matching rule is required';
    } else {
      // Check that each matching rule has both fields selected
      const incompleteRules = matchingRules.some(rule => !rule.ordersField || !rule.commissionsField);
      if (incompleteRules) {
        newErrors.matchingRules = 'All matching rules must have both Orders and Commissions fields selected';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateTemplate()) {
      onSave(templateKey, editedTemplate);
    }
  };

  const updateLinkingRule = (field, value) => {
    setEditedTemplate(prev => ({
      ...prev,
      linkingRules: {
        ...prev.linkingRules,
        [field]: value
      }
    }));
  };

  const updateFieldMapping = (exportTemplate, templateField, source, field, transform = 'normalize') => {
    setEditedTemplate(prev => ({
      ...prev,
      fieldMappings: {
        ...prev.fieldMappings,
        [exportTemplate]: {
          ...prev.fieldMappings[exportTemplate],
          [templateField]: { source, field, transform }
        }
      }
    }));
  };

  const removeFieldMapping = (exportTemplate, templateField) => {
    setEditedTemplate(prev => {
      const newMappings = { ...prev.fieldMappings[exportTemplate] };
      delete newMappings[templateField];
      return {
        ...prev,
        fieldMappings: {
          ...prev.fieldMappings,
          [exportTemplate]: newMappings
        }
      };
    });
  };

  const addFallbackKey = () => {
    setEditedTemplate(prev => ({
      ...prev,
      linkingRules: {
        ...prev.linkingRules,
        fallbackKeys: [
          ...(prev.linkingRules.fallbackKeys || []),
          { fields: [''], fuzzyThreshold: 0.85 }
        ]
      }
    }));
  };

  const updateFallbackKey = (index, field, value) => {
    setEditedTemplate(prev => {
      const newFallbackKeys = [...prev.linkingRules.fallbackKeys];
      if (field === 'fields') {
        newFallbackKeys[index].fields = [value];
      } else {
        newFallbackKeys[index][field] = value;
      }
      return {
        ...prev,
        linkingRules: {
          ...prev.linkingRules,
          fallbackKeys: newFallbackKeys
        }
      };
    });
  };

  const removeFallbackKey = (index) => {
    setEditedTemplate(prev => ({
      ...prev,
      linkingRules: {
        ...prev.linkingRules,
        fallbackKeys: prev.linkingRules.fallbackKeys.filter((_, i) => i !== index)
      }
    }));
  };

  const addMatchingRule = () => {
    setEditedTemplate(prev => ({
      ...prev,
      linkingRules: {
        ...prev.linkingRules,
        matchingRules: [
          ...(prev.linkingRules.matchingRules || []),
          { ordersField: '', commissionsField: '', matchType: 'exact', fuzzyThreshold: 0.85 }
        ]
      }
    }));
  };

  const updateMatchingRule = (index, field, value) => {
    setEditedTemplate(prev => {
      const newMatchingRules = [...(prev.linkingRules.matchingRules || [])];
      newMatchingRules[index] = {
        ...newMatchingRules[index],
        [field]: value
      };
      return {
        ...prev,
        linkingRules: {
          ...prev.linkingRules,
          matchingRules: newMatchingRules
        }
      };
    });
  };

  const removeMatchingRule = (index) => {
    setEditedTemplate(prev => ({
      ...prev,
      linkingRules: {
        ...prev.linkingRules,
        matchingRules: (prev.linkingRules.matchingRules || []).filter((_, i) => i !== index)
      }
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Edit Template</h2>
            <p className="text-gray-600">Configure linking rules and field mappings</p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b">
          <div className="flex space-x-8 px-6">
            {['general', 'linking', 'mapping'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab} {tab === 'general' ? 'Settings' : tab === 'linking' ? 'Rules' : 'Configuration'}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Template Name
                </label>
                <input
                  type="text"
                  value={editedTemplate.name}
                  onChange={(e) => setEditedTemplate(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full p-3 border rounded-lg ${errors.name ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="Enter template name"
                />
                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={editedTemplate.description}
                  onChange={(e) => setEditedTemplate(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  rows="3"
                  placeholder="Describe this template's purpose and use case"
                />
              </div>
            </div>
          )}

          {/* Linking Tab */}
          {activeTab === 'linking' && (
            <div className="space-y-6">
              {/* Matching Rules */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <label className="block text-sm font-medium text-gray-700">
                    Matching Rules
                  </label>
                  <button
                    onClick={addMatchingRule}
                    className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 flex items-center"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add match
                  </button>
                </div>

                {/* Header Row */}
                <div className="grid grid-cols-12 gap-3 mb-3 text-sm font-medium text-gray-700 pb-2 border-b">
                  <div className="col-span-3">Orders Field</div>
                  <div className="col-span-2">match</div>
                  <div className="col-span-2">fuzzy threshold</div>
                  <div className="col-span-3">Commissions Field</div>
                  <div className="col-span-2"></div>
                </div>

                {/* Matching Rules */}
                <div className="space-y-3">
                  {((editedTemplate.linkingRules.matchingRules) || [{ ordersField: '', commissionsField: '', matchType: 'exact', fuzzyThreshold: 0.85 }]).map((rule, index) => (
                    <div key={index} className="grid grid-cols-12 gap-3 items-center">
                      {/* Orders Field */}
                      <div className="col-span-3">
                        <select
                          value={rule.ordersField || ''}
                          onChange={(e) => updateMatchingRule(index, 'ordersField', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded text-sm"
                        >
                          <option value="">Select field...</option>
                          {availableFields.orders.map(field => (
                            <option key={field} value={field}>{field}</option>
                          ))}
                        </select>
                      </div>

                      {/* Match Type */}
                      <div className="col-span-2">
                        <select
                          value={rule.matchType || 'exact'}
                          onChange={(e) => updateMatchingRule(index, 'matchType', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded text-sm"
                        >
                          <option value="exact">exact</option>
                          <option value="fuzzy">fuzzy</option>
                        </select>
                      </div>

                      {/* Fuzzy Threshold */}
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          value={rule.fuzzyThreshold || 0.85}
                          onChange={(e) => updateMatchingRule(index, 'fuzzyThreshold', parseFloat(e.target.value))}
                          className="w-full p-2 border border-gray-300 rounded text-sm"
                          disabled={rule.matchType === 'exact'}
                        />
                      </div>

                      {/* Commissions Field */}
                      <div className="col-span-3">
                        <select
                          value={rule.commissionsField || ''}
                          onChange={(e) => updateMatchingRule(index, 'commissionsField', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded text-sm"
                        >
                          <option value="">Select field...</option>
                          {availableFields.commissions.map(field => (
                            <option key={field} value={field}>{field}</option>
                          ))}
                        </select>
                      </div>

                      {/* Actions */}
                      <div className="col-span-2 flex justify-end">
                        <button
                          onClick={() => removeMatchingRule(index)}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Delete match rule"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add helpful text */}
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    <strong>Tip:</strong> Add multiple matching rules to handle cases where a single field match isn't unique. 
                    The system will use exact matches first, then fall back to fuzzy matching with your specified thresholds.
                  </p>
                </div>

                {/* Error display */}
                {errors.matchingRules && (
                  <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">{errors.matchingRules}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mapping Tab */}
          {activeTab === 'mapping' && (
            <div className="space-y-6">
              {Object.keys(EXPORT_TEMPLATES).map(exportTemplate => (
                <div key={exportTemplate} className="border rounded-lg p-4">
                  <h4 className="text-lg font-semibold capitalize mb-4">{exportTemplate} Template</h4>
                  <div className="space-y-3">
                    {EXPORT_TEMPLATES[exportTemplate].map(templateField => {
                      const mapping = editedTemplate.fieldMappings[exportTemplate]?.[templateField];
                      return (
                        <div key={templateField} className="grid grid-cols-12 gap-3 items-center">
                          <div className="col-span-3 text-sm font-medium">{templateField}</div>
                          <div className="col-span-3">
                            <select
                              value={mapping?.source || ''}
                              onChange={(e) => {
                                if (e.target.value) {
                                  updateFieldMapping(exportTemplate, templateField, e.target.value, mapping?.field || '', mapping?.transform || 'normalize');
                                }
                              }}
                              className="w-full p-2 border rounded text-sm"
                            >
                              <option value="">Select source...</option>
                              <option value="orders">Orders File</option>
                              <option value="commissions">Commissions File</option>
                            </select>
                          </div>
                          <div className="col-span-3">
                            <select
                              value={mapping?.field || ''}
                              onChange={(e) => updateFieldMapping(exportTemplate, templateField, mapping?.source || 'orders', e.target.value, mapping?.transform || 'normalize')}
                              className="w-full p-2 border rounded text-sm"
                              disabled={!mapping?.source}
                            >
                              <option value="">Select field...</option>
                              {mapping?.source === 'orders' && availableFields.orders.map(header => (
                                <option key={header} value={header}>{header}</option>
                              ))}
                              {mapping?.source === 'commissions' && availableFields.commissions.map(header => (
                                <option key={header} value={header}>{header}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <select
                              value={mapping?.transform || 'normalize'}
                              onChange={(e) => updateFieldMapping(exportTemplate, templateField, mapping?.source || 'orders', mapping?.field || '', e.target.value)}
                              className="w-full p-2 border rounded text-sm"
                              disabled={!mapping?.field}
                            >
                              <option value="normalize">Normalize</option>
                              <option value="titleCase">Title Case</option>
                              <option value="upperCase">Upper Case</option>
                              <option value="currency">Currency</option>
                              <option value="date">Date</option>
                            </select>
                          </div>
                          <div className="col-span-1">
                            {mapping?.field && (
                              <button
                                onClick={() => removeFieldMapping(exportTemplate, templateField)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            <Save className="h-4 w-4 inline mr-2" />
            Save Template
          </button>
        </div>
      </div>
    </div>
  );
};

// Components
const FileUploadZone = ({ onFileUpload, fileType, currentFile }) => {
  const [dragActive, setDragActive] = useState(false);
  
  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files[0] && files[0].name.endsWith('.csv')) {
      handleFileUpload(files[0]);
    }
  };
  
  const handleFileUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const { headers, data } = parseCSV(e.target.result);
        onFileUpload({
          data,
          headers,
          filename: file.name,
          size: file.size,
          errors: []
        });
      } catch (error) {
        onFileUpload({
          data: null,
          headers: [],
          filename: file.name,
          size: file.size,
          errors: [error.message]
        });
      }
    };
    reader.readAsText(file);
  };
  
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-3 capitalize">{fileType} File</h3>
      {!currentFile.data ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-lg font-medium mb-2">Drop {fileType} CSV file here</p>
          <p className="text-gray-500 mb-4">or</p>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])}
            className="hidden"
            id={`${fileType}-upload`}
          />
          <label
            htmlFor={`${fileType}-upload`}
            className="bg-blue-500 text-white px-4 py-2 rounded cursor-pointer hover:bg-blue-600 transition-colors"
          >
            Browse Files
          </label>
          <p className="text-xs text-gray-400 mt-2">Supports CSV files up to 25MB</p>
        </div>
      ) : (
        <div className="border rounded-lg p-4 bg-green-50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <FileText className="h-5 w-5 text-green-600 mr-2" />
              <div>
                <p className="font-medium">{currentFile.filename}</p>
                <p className="text-sm text-gray-500">
                  {currentFile.data.length.toLocaleString()} rows, {currentFile.headers.length} columns
                </p>
              </div>
            </div>
            <button
              onClick={() => onFileUpload({ data: null, headers: [], filename: '', errors: [] })}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {currentFile.headers.length > 0 && (
            <div className="bg-white rounded border p-3">
              <p className="text-sm font-medium mb-2">Preview:</p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {currentFile.headers.slice(0, 6).map(header => (
                        <th key={header} className="px-2 py-1 text-left font-medium">
                          {header}
                        </th>
                      ))}
                      {currentFile.headers.length > 6 && (
                        <th className="px-2 py-1 text-left font-medium">...</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {currentFile.data.slice(0, 3).map((row, idx) => (
                      <tr key={idx} className="border-t">
                        {currentFile.headers.slice(0, 6).map(header => (
                          <td key={header} className="px-2 py-1">
                            {String(row[header]).substring(0, 20)}
                            {String(row[header]).length > 20 && '...'}
                          </td>
                        ))}
                        {currentFile.headers.length > 6 && <td className="px-2 py-1">...</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Conflict Resolution Card Component
const ConflictResolutionCard = ({ conflict, conflictIndex, onResolve }) => {
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [resolving, setResolving] = useState(false);

  const handleAccept = async (matchIndex) => {
    if (matchIndex === null || matchIndex === undefined) return;
    
    setResolving(true);
    try {
      await onResolve(conflictIndex, 'accept', matchIndex);
      setShowConfirmation(false);
      setSelectedMatch(null);
    } catch (error) {
      console.error('Error resolving conflict:', error);
    } finally {
      setResolving(false);
    }
  };

  const handleReject = async () => {
    setResolving(true);
    try {
      await onResolve(conflictIndex, 'reject');
      setShowConfirmation(false);
      setSelectedMatch(null);
    } catch (error) {
      console.error('Error rejecting matches:', error);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="border border-yellow-200 rounded-lg p-4 bg-yellow-50">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center">
          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium mr-2">
            NEEDS REVIEW
          </span>
          <span className="text-sm font-medium text-yellow-800">
            {conflict.commissionRecords?.length || 'Multiple'} potential matches found
          </span>
        </div>
        <span className="text-xs text-yellow-600 capitalize">
          {conflict.issue?.replace(/_/g, ' ') || 'Multiple matches'}
        </span>
      </div>
      
      {/* Order Record */}
      <div className="mb-4 p-3 bg-white rounded border">
        <p className="text-sm font-medium text-gray-700 mb-2">📋 Order Record to Match:</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <span className="font-medium text-gray-600">Customer:</span>
            <p className="text-gray-900">{conflict.orderRecord.Customer || 'N/A'}</p>
          </div>
          <div>
            <span className="font-medium text-gray-600">Provider:</span>
            <p className="text-gray-900">{conflict.orderRecord.Provider || 'N/A'}</p>
          </div>
          <div>
            <span className="font-medium text-gray-600">Account:</span>
            <p className="text-gray-900">
              {conflict.orderRecord['Billing Account Number'] || 
               conflict.orderRecord['Provider Account #'] || 
               conflict.orderRecord.Account || 'N/A'}
            </p>
          </div>
        </div>
        {conflict.orderRecord['Sales Rep'] && (
          <div className="mt-2 text-sm">
            <span className="font-medium text-gray-600">Sales Rep:</span>
            <span className="ml-1 text-gray-900">{conflict.orderRecord['Sales Rep']}</span>
          </div>
        )}
      </div>
      
      {/* Potential Commission Matches */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">💰 Potential Commission Matches:</p>
        <div className="space-y-3">
          {conflict.commissionRecords?.slice(0, 3).map((commissionRecord, matchIdx) => (
            <div 
              key={matchIdx} 
              className={`p-3 rounded border transition-all ${
                selectedMatch === matchIdx 
                  ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200' 
                  : 'bg-white border-gray-200 hover:border-blue-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <input
                    type="radio"
                    id={`match-${conflictIndex}-${matchIdx}`}
                    name={`conflict-${conflictIndex}`}
                    checked={selectedMatch === matchIdx}
                    onChange={() => setSelectedMatch(matchIdx)}
                    className="mr-2"
                  />
                  <label 
                    htmlFor={`match-${conflictIndex}-${matchIdx}`}
                    className="text-xs font-medium text-blue-600 cursor-pointer"
                  >
                    Match Option #{matchIdx + 1}
                  </label>
                </div>
                {conflict.scores && conflict.scores[matchIdx] && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    Score: {conflict.scores[matchIdx]}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="font-medium text-gray-600">Customer:</span>
                  <p className="text-gray-900">
                    {commissionRecord.Customer || 
                     commissionRecord['Provider Customer Name'] || 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Provider:</span>
                  <p className="text-gray-900">
                    {commissionRecord['Provider Name'] || 
                     commissionRecord.Provider || 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Account:</span>
                  <p className="text-gray-900">
                    {commissionRecord['Account Number'] || 
                     commissionRecord['Account #'] || 
                     commissionRecord.Account || 'N/A'}
                  </p>
                </div>
              </div>
              {(commissionRecord.Rep || commissionRecord['Sales Rep']) && (
                <div className="mt-2 text-sm">
                  <span className="font-medium text-gray-600">Rep:</span>
                  <span className="ml-1 text-gray-900">
                    {commissionRecord.Rep || commissionRecord['Sales Rep']}
                  </span>
                </div>
              )}
              {commissionRecord['Comp Paid'] && (
                <div className="mt-2 text-sm">
                  <span className="font-medium text-gray-600">Commission:</span>
                  <span className="ml-1 text-green-600 font-medium">
                    ${commissionRecord['Comp Paid']}
                  </span>
                </div>
              )}
            </div>
          )) || (
            <div className="p-3 bg-gray-50 rounded text-sm text-gray-600 italic">
              No detailed match information available
            </div>
          )}
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="mt-4 flex items-center justify-between p-3 bg-white border border-gray-200 rounded">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowConfirmation(true)}
            disabled={selectedMatch === null || resolving}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              selectedMatch !== null && !resolving
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {resolving ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Processing...
              </div>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 inline mr-1" />
                Accept Selected Match
              </>
            )}
          </button>
          
          <button
            onClick={() => handleReject()}
            disabled={resolving}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              !resolving
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {resolving ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Processing...
              </div>
            ) : (
              <>
                <X className="h-4 w-4 inline mr-1" />
                Reject All Matches
              </>
            )}
          </button>
        </div>
        
        {selectedMatch !== null && (
          <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
            Selected: Match Option #{selectedMatch + 1}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Confirm Match Resolution
              </h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to accept Match Option #{selectedMatch + 1} for this order record? 
                This will create a confirmed link between the order and commission records.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowConfirmation(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAccept(selectedMatch)}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                >
                  <CheckCircle className="h-4 w-4 inline mr-1" />
                  Confirm Match
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const LinkingDashboard = ({ linking, onLink, onResolveConflict }) => {
  // Calculate additional statistics
  const totalCommissionRecords = linking.statistics.totalCommissionRecords || 0;
  const totalOrderRecords = linking.statistics.totalRecords || 0;
  const matchRate = linking.statistics.matchRate || 0;
  const reviewRate = linking.statistics.totalRecords > 0 
    ? Math.round((linking.statistics.needsReview / linking.statistics.totalRecords) * 100) 
    : 0;
  const unmatchedRate = linking.statistics.totalRecords > 0 
    ? Math.round((linking.statistics.unmatched / linking.statistics.totalRecords) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Main Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center">
            <Database className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <p className="text-2xl font-bold text-blue-600">{totalOrderRecords}</p>
              <p className="text-sm text-gray-600">Total Records</p>
              <p className="text-xs text-blue-500">Order records to process</p>
            </div>
          </div>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="flex items-center">
            <Link className="h-8 w-8 text-green-600 mr-3" />
            <div>
              <p className="text-2xl font-bold text-green-600">{linking.statistics.matches}</p>
              <p className="text-sm text-gray-600">Successful Matches</p>
              <p className="text-xs text-green-500">{matchRate}% match rate</p>
            </div>
          </div>
        </div>
        
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <div className="flex items-center">
            <AlertTriangle className="h-8 w-8 text-yellow-600 mr-3" />
            <div>
              <p className="text-2xl font-bold text-yellow-600">{linking.statistics.needsReview}</p>
              <p className="text-sm text-gray-600">Need Review</p>
              <p className="text-xs text-yellow-500">{reviewRate}% require attention</p>
            </div>
          </div>
        </div>
        
        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
          <div className="flex items-center">
            <X className="h-8 w-8 text-red-600 mr-3" />
            <div>
              <p className="text-2xl font-bold text-red-600">{linking.statistics.unmatched}</p>
              <p className="text-sm text-gray-600">No Match</p>
              <p className="text-xs text-red-500">{unmatchedRate}% unmatched</p>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Statistics Panel */}
      <div className="bg-white border rounded-lg p-4">
        <h4 className="text-lg font-semibold mb-4 flex items-center">
          <Database className="h-5 w-5 mr-2" />
          Detailed Linking Statistics
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Record Counts */}
          <div>
            <h5 className="font-medium text-gray-700 mb-3">Record Counts</h5>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Order Records:</span>
                <span className="font-medium">{totalOrderRecords.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Commission Records:</span>
                <span className="font-medium">{totalCommissionRecords.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Total Records to Link:</span>
                <span className="font-medium text-blue-600">
                  {(totalOrderRecords + totalCommissionRecords).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column - Match Results */}
          <div>
            <h5 className="font-medium text-gray-700 mb-3">Match Results</h5>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-green-600">✓ Successful Matches:</span>
                <div className="text-right">
                  <span className="font-medium text-green-600">{linking.statistics.matches}</span>
                  <span className="text-xs text-green-500 ml-2">({matchRate}%)</span>
                </div>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-yellow-600">⚠ Need Review:</span>
                <div className="text-right">
                  <span className="font-medium text-yellow-600">{linking.statistics.needsReview}</span>
                  <span className="text-xs text-yellow-500 ml-2">({reviewRate}%)</span>
                </div>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-red-600">✗ No Match:</span>
                <div className="text-right">
                  <span className="font-medium text-red-600">{linking.statistics.unmatched}</span>
                  <span className="text-xs text-red-500 ml-2">({unmatchedRate}%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Processing Progress</span>
            <span className="text-sm text-gray-500">
              {totalOrderRecords > 0 ? Math.round(((linking.statistics.matches + linking.statistics.needsReview + linking.statistics.unmatched) / totalOrderRecords) * 100) : 0}% Complete
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div className="flex h-3 rounded-full overflow-hidden">
              <div 
                className="bg-green-500 transition-all duration-500"
                style={{ width: `${matchRate}%` }}
              ></div>
              <div 
                className="bg-yellow-500 transition-all duration-500"
                style={{ width: `${reviewRate}%` }}
              ></div>
              <div 
                className="bg-red-500 transition-all duration-500"
                style={{ width: `${unmatchedRate}%` }}
              ></div>
            </div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Matched ({matchRate}%)</span>
            <span>Review ({reviewRate}%)</span>
            <span>Unmatched ({unmatchedRate}%)</span>
          </div>
        </div>
      </div>

      {/* Match Quality Breakdown */}
      {linking.matches.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h4 className="text-lg font-semibold mb-4 flex items-center">
            <Zap className="h-5 w-5 mr-2" />
            Match Quality Breakdown
          </h4>
          
          {(() => {
            const highConfidence = linking.matches.filter(m => m.confidence >= 90).length;
            const mediumConfidence = linking.matches.filter(m => m.confidence >= 70 && m.confidence < 90).length;
            const lowConfidence = linking.matches.filter(m => m.confidence < 70).length;
            
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{highConfidence}</div>
                  <div className="text-sm text-green-700">High Confidence</div>
                  <div className="text-xs text-green-500">90%+ match score</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{mediumConfidence}</div>
                  <div className="text-sm text-yellow-700">Medium Confidence</div>
                  <div className="text-xs text-yellow-500">70-89% match score</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{lowConfidence}</div>
                  <div className="text-sm text-orange-700">Low Confidence</div>
                  <div className="text-xs text-orange-500">Below 70% match score</div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
      
      {linking.matches.length > 0 && (
        <div>
          <h4 className="text-lg font-semibold mb-3">Sample Matches</h4>
          <div className="space-y-3">
            {linking.matches.slice(0, 5).map((match, idx) => (
              <div key={idx} className="border rounded-lg p-4 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    match.confidence >= 90 ? 'bg-green-100 text-green-800' :
                    match.confidence >= 70 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {Math.round(match.confidence)}% confidence
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">Score: {match.matchScore}</span>
                    {match.isManuallyResolved && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        Manually Resolved
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Order Record:</p>
                    <p className="text-sm">{match.orderRecord.Customer || 'N/A'}</p>
                    <p className="text-xs text-gray-500">
                      {match.orderRecord.Provider || 'No Provider'} • 
                      {match.orderRecord['Billing Account Number'] || match.orderRecord.Account || 'No Account'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Commission Record:</p>
                    <p className="text-sm">{match.commissionRecord.Customer || match.commissionRecord['Provider Customer Name'] || 'N/A'}</p>
                    <p className="text-xs text-gray-500">
                      {match.commissionRecord['Provider Name'] || 'No Provider'} • 
                      {match.commissionRecord['Account Number'] || 'No Account'}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  Match criteria: {match.method}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {linking.conflicts && linking.conflicts.length > 0 && (
        <div>
          <h4 className="text-lg font-semibold mb-3 flex items-center">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
            Records Requiring Review ({linking.conflicts.length})
          </h4>
          <div className="space-y-4">
            {linking.conflicts.map((conflict, idx) => (
              <ConflictResolutionCard 
                key={idx}
                conflict={conflict}
                conflictIndex={idx}
                onResolve={onResolveConflict}
              />
            ))}
          </div>
        </div>
      )}
      
      {linking.statistics.matches === 0 && linking.statistics.totalRecords > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-amber-600 mr-2" />
            <div>
              <p className="font-medium text-amber-800">No Direct Matches Found</p>
              <p className="text-sm text-amber-700 mt-1">
                The system will use fuzzy matching based on customer names, providers, and other criteria.
                This is normal for files where Order IDs don't directly correspond.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const FieldMappingInterface = ({ state, dispatch }) => {
  const { files, mapping, ui } = state;
  const activeTemplate = ui.activeTemplate;
  const templateFields = EXPORT_TEMPLATES[activeTemplate] || [];
  const currentMapping = mapping.active[activeTemplate] || {};
  
  const handleMappingChange = (templateField, source, field) => {
    const newMapping = {
      ...currentMapping,
      [templateField]: { source, field }
    };
    dispatch({ type: 'SET_MAPPING', template: activeTemplate, payload: newMapping });
  };
  
  const getSuggestions = (templateField) => {
    const suggestions = [];
    const normalizedField = templateField.toLowerCase().replace(/\s+/g, '');
    
    // Check orders file
    if (files.orders.headers) {
      const orderMatch = findFieldMatches(normalizedField, files.orders.headers);
      if (orderMatch) {
        suggestions.push({
          source: 'orders',
          field: orderMatch.field,
          confidence: orderMatch.confidence
        });
      }
    }
    
    // Check commissions file  
    if (files.commissions.headers) {
      const commissionMatch = findFieldMatches(normalizedField, files.commissions.headers);
      if (commissionMatch) {
        suggestions.push({
          source: 'commissions',
          field: commissionMatch.field,
          confidence: commissionMatch.confidence
        });
      }
    }
    
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  };
  
  return (
    <div className="space-y-6">
      {/* Template Tabs */}
      <div className="border-b">
        <div className="flex space-x-8">
          {Object.keys(EXPORT_TEMPLATES).map(template => (
            <button
              key={template}
              onClick={() => dispatch({ type: 'SET_UI_STATE', payload: { activeTemplate: template } })}
              className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                activeTemplate === template
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {template}
              <span className="ml-2 px-2 py-0.5 bg-gray-100 text-xs rounded">
                {Object.keys(currentMapping).length}/{templateFields.length}
              </span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Mapping Grid */}
      <div className="space-y-4">
        <div className="grid grid-cols-12 gap-4 text-sm font-medium text-gray-700 pb-2 border-b">
          <div className="col-span-3">Template Field</div>
          <div className="col-span-3">Source File</div>
          <div className="col-span-3">Source Field</div>
          <div className="col-span-2">Suggestions</div>
          <div className="col-span-1">Preview</div>
        </div>
        
        {templateFields.map(templateField => {
          const mapping = currentMapping[templateField];
          const suggestions = getSuggestions(templateField);
          
          return (
            <div key={templateField} className="grid grid-cols-12 gap-4 items-center py-2 border-b">
              <div className="col-span-3 text-sm font-medium">{templateField}</div>
              
              <div className="col-span-3">
                <select
                  value={mapping?.source || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleMappingChange(templateField, e.target.value, mapping?.field || '');
                    }
                  }}
                  className="w-full p-2 border rounded text-sm"
                >
                  <option value="">Select source...</option>
                  <option value="orders">Orders File</option>
                  <option value="commissions">Commissions File</option>
                </select>
              </div>
              
              <div className="col-span-3">
                <select
                  value={mapping?.field || ''}
                  onChange={(e) => handleMappingChange(templateField, mapping?.source || 'orders', e.target.value)}
                  className="w-full p-2 border rounded text-sm"
                  disabled={!mapping?.source}
                >
                  <option value="">Select field...</option>
                  {mapping?.source === 'orders' && files.orders.headers.map(header => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                  {mapping?.source === 'commissions' && files.commissions.headers.map(header => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>
              
              <div className="col-span-2">
                {suggestions.length > 0 && (
                  <div className="space-y-1">
                    {suggestions.slice(0, 2).map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleMappingChange(templateField, suggestion.source, suggestion.field)}
                        className="block w-full text-left px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 rounded"
                      >
                        <div className="font-medium">{suggestion.field}</div>
                        <div className="text-gray-500">{suggestion.source} ({suggestion.confidence}%)</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="col-span-1">
                {mapping?.source && mapping?.field && (
                  <Eye className="h-4 w-4 text-gray-400" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ExportPreview = ({ state, onExport }) => {
  const { export: exportData, mapping, linking } = state;
  
  const generatePreviewData = () => {
    if (!linking.matches.length) return;
    
    const preview = { customer: [], location: [], contract: [], order: [] };
    
    linking.matches.slice(0, 10).forEach(match => {
      Object.keys(EXPORT_TEMPLATES).forEach(template => {
        if (!mapping.active[template]) return;
        
        const record = {};
        Object.entries(mapping.active[template]).forEach(([templateField, fieldMapping]) => {
          if (fieldMapping.source && fieldMapping.field) {
            const sourceRecord = fieldMapping.source === 'orders' 
              ? match.orderRecord 
              : match.commissionRecord;
            record[templateField] = sourceRecord[fieldMapping.field] || '';
          }
        });
        
        if (Object.keys(record).length > 0) {
          preview[template].push(record);
        }
      });
    });
    
    return preview;
  };
  
  const previewData = useMemo(() => generatePreviewData(), [linking.matches, mapping.active]);
  
  const handleExportAll = () => {
    const fullExportData = { customer: [], location: [], contract: [], order: [] };
    
    linking.matches.forEach(match => {
      Object.keys(EXPORT_TEMPLATES).forEach(template => {
        if (!mapping.active[template]) return;
        
        const record = {};
        Object.entries(mapping.active[template]).forEach(([templateField, fieldMapping]) => {
          if (fieldMapping.source && fieldMapping.field) {
            const sourceRecord = fieldMapping.source === 'orders' 
              ? match.orderRecord 
              : match.commissionRecord;
            record[templateField] = sourceRecord[fieldMapping.field] || '';
          }
        });
        
        if (Object.keys(record).length > 0) {
          fullExportData[template].push(record);
        }
      });
    });
    
    onExport(fullExportData);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Export Preview</h3>
        <button
          onClick={handleExportAll}
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors flex items-center"
        >
          <Download className="h-4 w-4 mr-2" />
          Export All Files
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(previewData || {}).map(([template, data]) => (
          <div key={template} className="border rounded-lg p-4">
            <h4 className="font-semibold capitalize mb-2">{template} Export</h4>
            <p className="text-sm text-gray-600 mb-3">{data.length} records</p>
            
            {data.length > 0 && (
              <div className="bg-gray-50 rounded p-2 text-xs">
                <div className="space-y-1">
                  {Object.keys(data[0]).slice(0, 4).map(field => (
                    <div key={field} className="flex justify-between">
                      <span className="font-medium">{field}:</span>
                      <span className="text-gray-600 truncate ml-2">
                        {String(data[0][field]).substring(0, 15)}
                        {String(data[0][field]).length > 15 && '...'}
                      </span>
                    </div>
                  ))}
                  {Object.keys(data[0]).length > 4 && (
                    <div className="text-gray-400">+ {Object.keys(data[0]).length - 4} more fields</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      
      {previewData && Object.values(previewData).some(data => data.length > 0) && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
            <span className="font-medium text-green-800">Ready for Export</span>
          </div>
          <p className="text-sm text-green-700 mt-1">
            All templates have been configured and preview data is available.
          </p>
        </div>
      )}
    </div>
  );
};

const StepIndicator = ({ currentStep, totalSteps = 4 }) => {
  const steps = [
    'Upload Files',
    'Link Data', 
    'Map Fields',
    'Export'
  ];
  
  return (
    <div className="flex items-center justify-center mb-8">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === currentStep;
        const isCompleted = stepNumber < currentStep;
        
        return (
          <div key={stepNumber} className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
              isCompleted ? 'bg-green-500 border-green-500 text-white' :
              isActive ? 'border-blue-500 text-blue-500' :
              'border-gray-300 text-gray-300'
            }`}>
              {isCompleted ? <CheckCircle className="h-5 w-5" /> : stepNumber}
            </div>
            <span className={`ml-2 text-sm font-medium ${
              isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-500'
            }`}>
              {step}
            </span>
            {stepNumber < totalSteps && (
              <ArrowRight className={`h-4 w-4 mx-4 ${
                stepNumber < currentStep ? 'text-green-500' : 'text-gray-300'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
};

// Main App Component
export default function TelecomDataProcessor() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  
  const handleFileUpload = (fileType, fileData) => {
    dispatch({ type: 'SET_FILE', fileType, payload: fileData });
    
    // Auto-detect template when both files are uploaded
    setTimeout(() => {
      const currentFiles = fileType === 'orders' 
        ? { orders: fileData, commissions: state.files.commissions }
        : { orders: state.files.orders, commissions: fileData };
      
      if (currentFiles.orders.data && currentFiles.commissions.data) {
        const detection = detectBestTemplate(currentFiles.orders, currentFiles.commissions);
        
        if (detection.templateKey && detection.confidence > 50) {
          // Auto-apply the detected template
          const template = CONFIGURATION_TEMPLATES[detection.templateKey];
          applyTemplate(detection.templateKey, template, true); // true = auto-applied
          
          dispatch({ 
            type: 'SET_UI_STATE', 
            payload: { 
              autoDetectedTemplate: detection,
              showAutoDetection: true 
            } 
          });
          
          // Hide auto-detection message after 8 seconds
          setTimeout(() => {
            dispatch({ 
              type: 'SET_UI_STATE', 
              payload: { showAutoDetection: false } 
            });
          }, 8000);
        }
      }
    }, 500); // Small delay to ensure state is updated
  };
  
  const applyTemplate = (templateKey, template, isAutoApplied = false) => {
    // Use custom template if it exists
    const templateToUse = state.ui.customTemplates[templateKey] || template;
    
    // Apply field mappings from template
    if (templateToUse.fieldMappings) {
      Object.entries(templateToUse.fieldMappings).forEach(([templateType, mappings]) => {
        dispatch({ 
          type: 'SET_MAPPING', 
          template: templateType, 
          payload: mappings 
        });
      });
    }
    
    // Store applied template info
    dispatch({ 
      type: 'SET_UI_STATE', 
      payload: { 
        appliedTemplate: templateKey,
        templateConfig: templateToUse,
        isAutoApplied: isAutoApplied
      } 
    });
    
    // Show success message briefly (longer for auto-applied)
    setTimeout(() => {
      dispatch({ 
        type: 'SET_UI_STATE', 
        payload: { appliedTemplate: null, isAutoApplied: false } 
      });
    }, isAutoApplied ? 8000 : 5000);
  };

  const handleEditTemplate = (templateKey) => {
    const baseTemplate = CONFIGURATION_TEMPLATES[templateKey];
    const customTemplate = state.ui.customTemplates[templateKey];
    const templateToEdit = customTemplate || baseTemplate;
    
    dispatch({ 
      type: 'SET_UI_STATE', 
      payload: { 
        showTemplateEditor: true,
        editingTemplate: { key: templateKey, template: templateToEdit }
      } 
    });
  };

  const handleSaveTemplate = (templateKey, editedTemplate) => {
    dispatch({ 
      type: 'UPDATE_TEMPLATE', 
      templateKey, 
      template: editedTemplate 
    });
    
    dispatch({ 
      type: 'SET_UI_STATE', 
      payload: { 
        showTemplateEditor: false,
        editingTemplate: null
      } 
    });
  };

  const handleCancelEdit = () => {
    dispatch({ 
      type: 'SET_UI_STATE', 
      payload: { 
        showTemplateEditor: false,
        editingTemplate: null
      } 
    });
  };

  const getAvailableFields = () => {
    return {
      orders: state.files.orders.headers || [],
      commissions: state.files.commissions.headers || []
    };
  };

  const handleResolveConflict = async (conflictIndex, action, matchIndex = null) => {
    return new Promise((resolve) => {
      // Add a small delay to simulate processing
      setTimeout(() => {
        dispatch({
          type: 'RESOLVE_CONFLICT',
          payload: { conflictIndex, action, matchIndex }
        });
        resolve();
      }, 1000);
    });
  };
  
  const handleLinkData = () => {
    if (!state.files.orders.data || !state.files.commissions.data) return;
    
    dispatch({ type: 'SET_UI_STATE', payload: { loading: true } });
    
    setTimeout(() => {
      // Use template configuration if available, otherwise use default
      const linkingConfig = state.ui.templateConfig?.linkingRules || { 
        strategy: 'multi_criteria',
        matchingRules: [
          { ordersField: 'Order ID', commissionsField: 'Order ID', matchType: 'exact', fuzzyThreshold: 0.85 },
          { ordersField: 'Customer', commissionsField: 'Customer', matchType: 'fuzzy', fuzzyThreshold: 0.85 }
        ]
      };
      
      const linkingResults = linkRecords(
        state.files.orders.data,
        state.files.commissions.data,
        linkingConfig
      );
      
      dispatch({ type: 'SET_LINKING_RESULTS', payload: linkingResults });
      dispatch({ type: 'SET_UI_STATE', payload: { loading: false } });
    }, 1000);
  };
  
  const handleExport = (exportData) => {
    Object.entries(exportData).forEach(([template, data]) => {
      if (data.length === 0) return;
      
      const headers = Object.keys(data[0]);
      const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${template}_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  };
  
  const canProceedToStep = (step) => {
    switch (step) {
      case 2:
        return state.files.orders.data && state.files.commissions.data;
      case 3:
        return state.linking.matches.length > 0;
      case 4:
        return Object.values(state.mapping.active).some(mapping => Object.keys(mapping).length > 0);
      default:
        return true;
    }
  };
  
  const nextStep = () => {
    if (state.currentStep < 4 && canProceedToStep(state.currentStep + 1)) {
      if (state.currentStep === 1) {
        handleLinkData();
      }
      dispatch({ type: 'SET_STEP', payload: state.currentStep + 1 });
    }
  };
  
  const prevStep = () => {
    if (state.currentStep > 1) {
      dispatch({ type: 'SET_STEP', payload: state.currentStep - 1 });
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Telecom Data Processor
          </h1>
          <p className="text-gray-600">
            Process and prepare telecom orders and commission statements for database import
          </p>
        </div>
        
        {/* Step Indicator */}
        <StepIndicator currentStep={state.currentStep} />
        
        {/* Main Content */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          {state.currentStep === 1 && (
            <div>
              <h2 className="text-xl font-semibold mb-6">Step 1: Upload Files</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <FileUploadZone
                  fileType="orders"
                  currentFile={state.files.orders}
                  onFileUpload={(data) => handleFileUpload('orders', data)}
                />
                <FileUploadZone
                  fileType="commissions"
                  currentFile={state.files.commissions}
                  onFileUpload={(data) => handleFileUpload('commissions', data)}
                />
              </div>
              
              {/* Auto-Detection Results */}
              {state.ui.showAutoDetection && state.ui.autoDetectedTemplate && (
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <Zap className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-blue-800">
                        🤖 Auto-Detection: {CONFIGURATION_TEMPLATES[state.ui.autoDetectedTemplate.templateKey]?.name} Template Applied!
                      </h4>
                      <p className="text-sm text-blue-700 mt-1">
                        Based on your file names and data structure, we automatically configured the best template 
                        (confidence: {state.ui.autoDetectedTemplate.confidence}%).
                      </p>
                      <div className="mt-2 text-xs text-blue-600">
                        <strong>Detection scores:</strong> {state.ui.autoDetectedTemplate.allScores
                          .filter(s => s.confidence > 0)
                          .map(s => `${CONFIGURATION_TEMPLATES[s.template]?.name}: ${s.confidence}%`)
                          .join(', ')}
                      </div>
                      <div className="mt-3 flex space-x-2">
                        <button 
                          onClick={() => dispatch({ type: 'SET_UI_STATE', payload: { showAutoDetection: false } })}
                          className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                        >
                          Got it!
                        </button>
                        <button 
                          onClick={() => {
                            dispatch({ type: 'SET_UI_STATE', payload: { 
                              showAutoDetection: false, 
                              appliedTemplate: null,
                              templateConfig: null
                            }});
                            // Clear mappings
                            Object.keys(EXPORT_TEMPLATES).forEach(template => {
                              dispatch({ type: 'SET_MAPPING', template, payload: {} });
                            });
                          }}
                          className="text-xs bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600"
                        >
                          Clear & Choose Manually
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Template Selection */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Quick Start Templates</h3>
                  {state.ui.appliedTemplate && (
                    <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                      {state.ui.isAutoApplied ? '🤖 Auto-Applied' : '✅ Applied'}: {CONFIGURATION_TEMPLATES[state.ui.appliedTemplate]?.name}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  {state.ui.appliedTemplate 
                    ? "Template applied! You can choose a different one or proceed to the next step."
                    : "Click a template to automatically configure linking and field mapping for your provider."
                  }
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(CONFIGURATION_TEMPLATES).map(([key, template]) => {
                    const isSelected = state.ui.appliedTemplate === key;
                    const isCustomized = !!state.ui.customTemplates[key];
                    const displayTemplate = state.ui.customTemplates[key] || template;
                    
                    return (
                      <div 
                        key={key} 
                        className={`border rounded-lg p-4 transition-all duration-200 ${
                          isSelected 
                            ? 'bg-green-50 border-green-300 ring-2 ring-green-200' 
                            : 'hover:bg-blue-50 hover:border-blue-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center">
                              <h4 className="font-medium text-gray-900">{displayTemplate.name}</h4>
                              {isSelected && (
                                <CheckCircle className="h-4 w-4 text-green-600 ml-2" />
                              )}
                              {isCustomized && (
                                <Edit3 className="h-3 w-3 text-blue-600 ml-1" title="Customized" />
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{displayTemplate.description}</p>
                            <div className="mt-3 space-y-1">
                              <div className="flex items-center text-xs">
                                <span className="text-gray-500">Matching Rules:</span>
                                <span className="ml-2 bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                  {displayTemplate.linkingRules.matchingRules?.length || 0} rules
                                </span>
                              </div>
                              <div className="text-xs text-gray-500">
                                Strategy: {displayTemplate.linkingRules.strategy}
                                {isCustomized && <span className="ml-2 text-blue-600">(Modified)</span>}
                              </div>
                              <div className="text-xs text-green-600">
                                {Object.keys(displayTemplate.fieldMappings).length} templates configured
                              </div>
                            </div>
                          </div>
                          <div className="ml-2 flex flex-col items-center space-y-2">
                            <div className={`w-3 h-3 rounded-full ${
                              isSelected ? 'bg-green-500' : 'bg-green-400'
                            }`}></div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditTemplate(key);
                              }}
                              className="text-gray-400 hover:text-blue-600 transition-colors"
                              title="Edit Template"
                            >
                              <Settings className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-100 flex space-x-2">
                          <button 
                            onClick={() => applyTemplate(key, template)}
                            className={`flex-1 text-xs px-3 py-1 rounded transition-colors ${
                              isSelected 
                                ? 'bg-green-500 text-white hover:bg-green-600' 
                                : 'bg-blue-500 text-white hover:bg-blue-600'
                            }`}
                          >
                            {isSelected ? 'Selected' : 'Apply Template'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditTemplate(key);
                            }}
                            className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                            title="Edit Template"
                          >
                            <Edit3 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Manual Template Application Feedback */}
                {state.ui.appliedTemplate && !state.ui.isAutoApplied && (
                  <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                      <span className="font-medium text-green-800">
                        {CONFIGURATION_TEMPLATES[state.ui.appliedTemplate]?.name} template applied!
                      </span>
                    </div>
                    <p className="text-sm text-green-700 mt-1">
                      Linking rules and field mappings have been automatically configured. 
                      You can proceed to the next step or modify the settings as needed.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {state.currentStep === 2 && (
            <div>
              <h2 className="text-xl font-semibold mb-6">Step 2: Data Linking</h2>
              {state.ui.loading ? (
                <div className="text-center py-12">
                  <Zap className="h-12 w-12 text-blue-500 mx-auto mb-4 animate-spin" />
                  <p className="text-lg">Analyzing and linking records...</p>
                </div>
              ) : (
                <LinkingDashboard linking={state.linking} onLink={handleLinkData} onResolveConflict={handleResolveConflict} />
              )}
            </div>
          )}
          
          {state.currentStep === 3 && (
            <div>
              <h2 className="text-xl font-semibold mb-6">Step 3: Field Mapping</h2>
              <FieldMappingInterface state={state} dispatch={dispatch} />
            </div>
          )}
          
          {state.currentStep === 4 && (
            <div>
              <h2 className="text-xl font-semibold mb-6">Step 4: Export</h2>
              <ExportPreview state={state} onExport={handleExport} />
            </div>
          )}
        </div>
        
        {/* Template Editor Modal */}
        {state.ui.showTemplateEditor && state.ui.editingTemplate && (
          <TemplateEditor
            template={state.ui.editingTemplate.template}
            templateKey={state.ui.editingTemplate.key}
            onSave={handleSaveTemplate}
            onCancel={handleCancelEdit}
            availableFields={getAvailableFields()}
          />
        )}
        
        {/* Navigation */}
        <div className="flex justify-between">
          <button
            onClick={prevStep}
            disabled={state.currentStep === 1}
            className={`px-4 py-2 rounded transition-colors ${
              state.currentStep === 1
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Previous
          </button>
          
          <button
            onClick={nextStep}
            disabled={state.currentStep === 4 || !canProceedToStep(state.currentStep + 1)}
            className={`px-4 py-2 rounded transition-colors ${
              state.currentStep === 4 || !canProceedToStep(state.currentStep + 1)
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {state.currentStep === 4 ? 'Complete' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}