"use client";

import { useState, useCallback, useMemo, memo } from 'react';
import { FileText, Upload, Download, Settings, Eye, EyeOff, Edit3, X, CheckCircle, AlertCircle, Info, AlertTriangle, DollarSign, Calendar, Package, TrendingUp, BarChart3, Users, Link, FileCheck } from 'lucide-react';
import * as XLSX from 'xlsx';

// ==================== CONSTANTS ====================
const STEPS = { UPLOAD: 1, WORKSHEET_SELECTION: 1.5, MAPPING: 2, LINKING: 2.5, RESULTS: 3 };

const FILE_TYPES = {
  ORDER: 'order',
  COMMISSION: 'commission',
  UNKNOWN: 'unknown'
};

const FIELD_CATEGORIES = {
  linking: {
    label: 'Record Linking',
    icon: <Link size={16} />,
    fields: {
      accountNumber: 'Account Number',
      customerIdPrimary: 'Customer ID (Primary)',
      customerIdSecondary: 'Customer ID (Secondary)',
      locationKey: 'Location Identifier'
    }
  },
  customer: {
    label: 'Customer & Location',
    icon: <FileText size={16} />,
    fields: {
      companyName: 'Company Name',
      locationName: 'Location Name',
      address1: 'Address 1',
      address2: 'Address 2', 
      city: 'City',
      state: 'State',
      zipCode: 'Zip Code',
      fullAddress: 'Full Address (Single Field)'
    }
  },
  service: {
    label: 'Services & Products',
    icon: <Package size={16} />,
    fields: {
      product: 'Product/Service Name',
      productDescription: 'Product Description',
      serviceType: 'Service Type',
      quantity: 'Quantity',
      bandwidth: 'Bandwidth/Capacity',
      orderNumber: 'Order Number',
      supplier: 'Supplier/Provider'
    }
  },
  billing: {
    label: 'Billing & Revenue',
    icon: <DollarSign size={16} />,
    fields: {
      monthlyRecurring: 'Monthly Recurring Charge (MRC)',
      nonRecurring: 'Non-Recurring Charge (NRC)',
      netBilled: 'Net Billed Amount', 
      revenue: 'Revenue',
      contractValue: 'Contract Value',
      contractTerm: 'Contract Term (Months)'
    }
  },
  commission: {
    label: 'Commission & Sales',
    icon: <TrendingUp size={16} />,
    fields: {
      commissionAmount: 'Commission Amount',
      commissionPercent: 'Commission Percentage',
      commissionType: 'Commission Type',
      salesRep: 'Sales Representative',
      repId: 'Rep ID',
      agency: 'Agency'
    }
  },
  dates: {
    label: 'Important Dates',
    icon: <Calendar size={16} />,
    fields: {
      installDate: 'Install Date',
      activationDate: 'Service Activation Date', 
      contractDate: 'Contract Sign Date',
      invoiceDate: 'Invoice Date',
      expirationDate: 'Contract Expiration Date',
      orderDate: 'Order Date',
      focDate: 'FOC Date'
    }
  }
};

const REQUIRED_FIELDS = {
  customer: ['companyName'],
  service: [],
  linking: [],
  billing: [],
  commission: [],
  dates: []
};

const PROVIDER_MAPPINGS = {
  windstream: {
    order: {
      companyName: ['customer name'],
      address1: ['street address'],
      address2: ['suite/unit/floor/apt'],
      city: ['city'],
      state: ['state'],
      zipCode: ['zip'],
      accountNumber: ['account number'],
      monthlyRecurring: ['current mbr'],
      salesRep: ['seller name'],
      expirationDate: ['contract expiration date']
    },
    commission: {
      companyName: ['custfname', 'custlname'],
      product: ['product', 'productdescr'],
      commissionAmount: ['commission'],
      revenue: ['revenue'],
      salesRep: ['lname'],
      accountNumber: ['accountnbr'],
      invoiceDate: ['commdate']
    }
  },
  intelisys: {
    order: {
      companyName: ['customer'],
      product: ['products ordered'],
      monthlyRecurring: ['total estimated mrc'],
      nonRecurring: ['total estimated nrc'],
      address1: ['location address'],
      accountNumber: ['account number'],
      salesRep: ['rep'],
      orderDate: ['order date'],
      installDate: ['scheduled install date'],
      activationDate: ['service activation date']
    },
    commission: {
      companyName: ['customer'],
      product: ['product'],
      monthlyRecurring: ['monthly order revenue'],
      commissionAmount: ['sales comm.'],
      address1: ['address'],
      city: ['city'],
      state: ['state'],
      zipCode: ['zip'],
      salesRep: ['rep'],
      accountNumber: ['customer id', 'account'],
      invoiceDate: ['invoice date']
    }
  },
  sandler: {
    order: {
      companyName: ['customer'],
      monthlyRecurring: ['contract mrc'],
      contractTerm: ['contract terms (months)'],
      address1: ['address'],
      city: ['city'],
      state: ['state'],
      zipCode: ['zip code'],
      accountNumber: ['provider account #'],
      contractDate: ['contract sign date']
    },
    commission: {
      companyName: ['customer'],
      product: ['product'],
      netBilled: ['net billed'],
      commissionAmount: ['agent comm.'],
      address1: ['address'],
      accountNumber: ['account #'],
      invoiceDate: ['invoice date'],
      installDate: ['install date']
    }
  },
  ibs: {
    order: {
      companyName: ['customer name'],
      locationName: ['location name'],
      address1: ['address'],
      address2: ['address line 2'],
      city: ['city'],
      state: ['state'],
      zipCode: ['zip code'],
      monthlyRecurring: ['mrc'],
      product: ['products sold'],
      salesRep: ['rep name'],
      installDate: ['install date'],
      contractDate: ['contract sign date']
    },
    commission: {
      companyName: ['customer'],
      product: ['product'],
      netBilled: ['net billed'],
      commissionAmount: ['sales comm.'],
      salesRep: ['rep'],
      accountNumber: ['account'],
      invoiceDate: ['invoice date']
    }
  }
};

// ==================== UTILITY FUNCTIONS ====================
const parseMonetary = (value) => {
  if (!value) return 0;
  const cleaned = String(value).replace(/[$,\s]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

const parseDate = (dateString) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
};

const detectProviderType = (filename, headers) => {
  const lowerFilename = filename.toLowerCase();
  const lowerHeaders = headers.map(h => h.toLowerCase());
  
  if (lowerFilename.includes('windstream') || lowerHeaders.includes('custfname') || lowerHeaders.includes('accountnbr')) {
    return 'windstream';
  } else if (lowerFilename.includes('intelisys') || lowerHeaders.includes('rep id')) {
    return 'intelisys';
  } else if (lowerFilename.includes('sandler') || lowerHeaders.includes('sandler notes')) {
    return 'sandler';
  } else if (lowerFilename.includes('ibs') || lowerHeaders.includes('assignment code')) {
    return 'ibs';
  }
  return 'unknown';
};

const detectFileType = (filename, headers) => {
  const lowerFilename = filename.toLowerCase();
  const lowerHeaders = headers.map(h => h.toLowerCase());
  
  // Order file indicators
  const orderIndicators = [
    'order', 'contract', 'mrc', 'monthly recurring', 'contract sign date', 
    'install date', 'service activation', 'contract expiration', 'current mbr',
    'total estimated mrc', 'products ordered', 'contract mrc'
  ];
  
  // Commission file indicators  
  const commissionIndicators = [
    'commission', 'comm.', 'sales comm', 'agent comm', 'net billed',
    'invoice date', 'billing month', 'commission run'
  ];
  
  const orderScore = orderIndicators.reduce((score, indicator) => {
    if (lowerFilename.includes(indicator)) score += 2;
    if (lowerHeaders.some(h => h.includes(indicator))) score += 1;
    return score;
  }, 0);
  
  const commissionScore = commissionIndicators.reduce((score, indicator) => {
    if (lowerFilename.includes(indicator)) score += 2;
    if (lowerHeaders.some(h => h.includes(indicator))) score += 1;
    return score;
  }, 0);
  
  if (orderScore > commissionScore) return FILE_TYPES.ORDER;
  if (commissionScore > orderScore) return FILE_TYPES.COMMISSION;
  return FILE_TYPES.UNKNOWN;
};

const detectEnhancedColumnMappings = (headers, providerType, fileType) => {
  const mapping = {};
  
  // Get provider-specific mappings
  const providerMapping = PROVIDER_MAPPINGS[providerType]?.[fileType] || {};
  
  // Apply provider-specific mappings first
  Object.entries(providerMapping).forEach(([fieldType, patterns]) => {
    const matchedHeader = headers.find(header => 
      patterns.some(pattern => header.toLowerCase().includes(pattern))
    );
    if (matchedHeader) {
      mapping[fieldType] = matchedHeader;
    }
  });

  // Generic matchers for fallback
  const genericMatchers = {
    companyName: (header) => {
      const lower = header.toLowerCase();
      return ['customer', 'company', 'business', 'client'].some(keyword => 
        lower.includes(keyword) && !lower.includes('id') && !lower.includes('account')
      );
    },
    accountNumber: (header) => {
      const lower = header.toLowerCase();
      return ['account', 'acct'].some(keyword => 
        lower.includes(keyword) && (lower.includes('number') || lower.includes('nbr') || lower.includes('#'))
      );
    },
    product: (header) => {
      const lower = header.toLowerCase();
      return ['product', 'service'].some(keyword => lower.includes(keyword));
    },
    monthlyRecurring: (header) => {
      const lower = header.toLowerCase();
      return ['mrc', 'monthly recurring', 'contract mrc', 'current mbr', 'total estimated mrc'].some(keyword => 
        lower.includes(keyword)
      );
    },
    commissionAmount: (header) => {
      const lower = header.toLowerCase();
      return ['commission', 'comm.', 'agent comm', 'sales comm'].some(keyword => 
        lower.includes(keyword) && !lower.includes('%')
      );
    },
    netBilled: (header) => {
      const lower = header.toLowerCase();
      return lower.includes('net billed') || lower.includes('net billed');
    },
    salesRep: (header) => {
      const lower = header.toLowerCase();
      return ['rep', 'agent', 'sales', 'seller'].some(keyword => 
        lower.includes(keyword) && !lower.includes('id')
      );
    },
    address1: (header) => {
      const lower = header.toLowerCase();
      return lower === 'address' || lower.includes('street') || lower.includes('location address');
    },
    fullAddress: (header) => {
      const lower = header.toLowerCase();
      return lower.includes('address') && (lower.includes('city') || lower.includes('state') || lower.includes('zip'));
    },
    city: (header) => {
      const lower = header.toLowerCase();
      return lower === 'city' || (lower.includes('city') && !lower.includes('account'));
    },
    state: (header) => {
      const lower = header.toLowerCase();
      return lower === 'state' || (lower.includes('state') && !lower.includes('account'));
    },
    zipCode: (header) => {
      const lower = header.toLowerCase();
      return ['zip', 'postal', 'zipcode'].some(keyword => lower.includes(keyword));
    }
  };

  // Apply generic matchers for any unmapped fields
  headers.forEach(header => {
    Object.entries(genericMatchers).forEach(([fieldType, matcher]) => {
      if (!mapping[fieldType] && matcher(header)) {
        mapping[fieldType] = header;
      }
    });
  });

  return mapping;
};

// Address normalization for matching
const normalizeAddress = (address) => {
  if (!address) return '';
  return address.toLowerCase()
    .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|circle|cir|court|ct|way|wy|place|pl)\b/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// Account number normalization for matching
const normalizeAccountNumber = (accountNum) => {
  if (!accountNum) return '';
  return String(accountNum).replace(/[^\w]/g, '').toLowerCase();
};

// Address matching function
const addressSimilarity = (addr1, addr2) => {
  const norm1 = normalizeAddress(addr1);
  const norm2 = normalizeAddress(addr2);
  
  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1;
  
  const words1 = norm1.split(' ').filter(w => w.length > 2);
  const words2 = norm2.split(' ').filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const matches = words1.filter(w1 => words2.some(w2 => w1.includes(w2) || w2.includes(w1))).length;
  const maxWords = Math.max(words1.length, words2.length);
  
  return matches / maxWords;
};

// ==================== SNACKBAR COMPONENTS ====================
const Snackbar = memo(({ notification, onClose }) => {
  const getIcon = () => {
    switch (notification.type) {
      case 'success': return <CheckCircle className="w-5 h-5" />;
      case 'error': return <AlertCircle className="w-5 h-5" />;
      case 'warning': return <AlertTriangle className="w-5 h-5" />;
      default: return <Info className="w-5 h-5" />;
    }
  };

  const getStyles = () => {
    switch (notification.type) {
      case 'success': return 'bg-green-50 border-green-200 text-green-800';
      case 'error': return 'bg-red-50 border-red-200 text-red-800';
      case 'warning': return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      default: return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  return (
    <div className={`flex items-center gap-3 p-4 border rounded-lg shadow-lg ${getStyles()} animate-in slide-in-from-right duration-300`}>
      {getIcon()}
      <div className="flex-1">
        {notification.title && (
          <div className="font-medium">{notification.title}</div>
        )}
        <div className={notification.title ? 'text-sm' : ''}>{notification.message}</div>
      </div>
      <button
        onClick={onClose}
        className="p-1 hover:bg-black hover:bg-opacity-10 rounded"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
});

const SnackbarContainer = memo(({ notifications, onRemove }) => (
  <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
    {notifications.map((notification) => (
      <Snackbar
        key={notification.id}
        notification={notification}
        onClose={() => onRemove(notification.id)}
      />
    ))}
  </div>
));

// ==================== CUSTOM HOOKS ====================
const useSnackbar = () => {
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((notification) => {
    const id = Date.now() + Math.random();
    const newNotification = { id, ...notification };
    
    setNotifications(prev => [...prev, newNotification]);

    const duration = notification.duration || 5000;
    if (duration > 0) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, duration);
    }
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const showSuccess = useCallback((message, title = null, duration = 4000) => {
    addNotification({ type: 'success', message, title, duration });
  }, [addNotification]);

  const showError = useCallback((message, title = 'Error', duration = 6000) => {
    addNotification({ type: 'error', message, title, duration });
  }, [addNotification]);

  const showWarning = useCallback((message, title = 'Warning', duration = 5000) => {
    addNotification({ type: 'warning', message, title, duration });
  }, [addNotification]);

  const showInfo = useCallback((message, title = null, duration = 4000) => {
    addNotification({ type: 'info', message, title, duration });
  }, [addNotification]);

  return {
    notifications,
    removeNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo
  };
};

// ==================== FILE PROCESSING UTILITIES ====================
const parseCSV = (content) => {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return { headers: [], data: [] };

  const rawHeaders = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const headers = [];
  const seenHeaders = new Set();
  
  rawHeaders.forEach((header, index) => {
    let uniqueHeader = header;
    let counter = 1;
    
    while (seenHeaders.has(uniqueHeader)) {
      uniqueHeader = `${header} (${counter})`;
      counter++;
    }
    
    seenHeaders.add(uniqueHeader);
    headers.push(uniqueHeader);
  });

  const data = lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    return row;
  });

  return { headers, data };
};

const parseExcel = (fileBuffer) => {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'array' });
    
    if (workbook.SheetNames.length === 1) {
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length === 0) return { headers: [], data: [] };

      const rawHeaders = jsonData[0].map(h => String(h || '').trim());
      const headers = [];
      const seenHeaders = new Set();
      
      rawHeaders.forEach((header, index) => {
        let uniqueHeader = header;
        let counter = 1;
        
        while (seenHeaders.has(uniqueHeader)) {
          uniqueHeader = `${header} (${counter})`;
          counter++;
        }
        
        seenHeaders.add(uniqueHeader);
        headers.push(uniqueHeader);
      });

      const data = jsonData.slice(1)
        .map(row => {
          const rowData = {};
          headers.forEach((header, index) => {
            rowData[header] = String(row[index] || '').trim();
          });
          return rowData;
        })
        .filter(row => Object.values(row).some(val => val));

      return { headers, data };
    } else {
      const worksheets = workbook.SheetNames.map(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length === 0) {
          return {
            name: sheetName,
            rowCount: 0,
            columnCount: 0,
            sampleHeaders: [],
            score: 0
          };
        }

        const headers = jsonData[0] ? jsonData[0].map(h => String(h || '').trim()).filter(Boolean) : [];
        const dataRows = jsonData.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== ''));
        
        let score = 0;
        
        const relevantKeywords = ['company', 'customer', 'business', 'organization', 'client', 'address', 'city', 'state', 'zip'];
        headers.forEach(header => {
          const lowerHeader = header.toLowerCase();
          relevantKeywords.forEach(keyword => {
            if (lowerHeader.includes(keyword)) {
              score += 10;
            }
          });
        });
        
        score += Math.min(dataRows.length, 100);
        score += Math.min(headers.length, 20);
        
        const hasCompany = headers.some(h => ['company', 'customer', 'business', 'organization', 'client'].some(k => h.toLowerCase().includes(k)));
        const hasAddress = headers.some(h => ['address', 'city', 'state', 'zip'].some(k => h.toLowerCase().includes(k)));
        if (hasCompany && hasAddress) {
          score += 50;
        }
        
        return {
          name: sheetName,
          rowCount: dataRows.length,
          columnCount: headers.length,
          sampleHeaders: headers.slice(0, 10),
          score: score
        };
      });

      const recommendedIndex = worksheets.reduce((bestIndex, worksheet, index) => {
        return worksheets[bestIndex].score < worksheet.score ? index : bestIndex;
      }, 0);

      return {
        isMultiWorksheet: true,
        worksheets: worksheets,
        recommendedWorksheetIndex: recommendedIndex
      };
    }
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    return { headers: [], data: [] };
  }
};

const parseExcelWorksheet = (fileBuffer, worksheetIndex) => {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[worksheetIndex];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length === 0) return { headers: [], data: [] };

    const rawHeaders = jsonData[0].map(h => String(h || '').trim());
    const headers = [];
    const seenHeaders = new Set();
    
    rawHeaders.forEach((header, index) => {
      let uniqueHeader = header;
      let counter = 1;
      
      while (seenHeaders.has(uniqueHeader)) {
        uniqueHeader = `${header} (${counter})`;
        counter++;
      }
      
      seenHeaders.add(uniqueHeader);
      headers.push(uniqueHeader);
    });

    const data = jsonData.slice(1)
      .map(row => {
        const rowData = {};
        headers.forEach((header, index) => {
          rowData[header] = String(row[index] || '').trim();
        });
        return rowData;
      })
      .filter(row => Object.values(row).some(val => val));

    return { headers, data };
  } catch (error) {
    console.error('Error parsing Excel worksheet:', error);
    return { headers: [], data: [] };
  }
};

// Address parsing utility
const parseAddressFields = (record, mapping, row) => {
  let address1 = '', address2 = '', city = '', state = '', zipCode = '';
  
  // Check if we have a single full address field
  if (mapping.fullAddress && row[mapping.fullAddress]) {
    const fullAddr = row[mapping.fullAddress].trim();
    // For single address fields, put everything in address1 initially
    // User can use standardization to separate later
    address1 = fullAddr;
  } else {
    // Use individual address fields if available
    address1 = mapping.address1 ? (row[mapping.address1] || '').trim() : '';
    address2 = mapping.address2 ? (row[mapping.address2] || '').trim() : '';
    city = mapping.city ? (row[mapping.city] || '').trim() : '';
    state = mapping.state ? (row[mapping.state] || '').trim() : '';
    zipCode = mapping.zipCode ? (row[mapping.zipCode] || '').trim() : '';
  }
  
  return { address1, address2, city, state, zipCode };
};

// Enhanced address extraction for comparison
const getAddressForMatching = (record) => {
  // If address1 contains a full address (likely from single field), parse it for matching
  if (record.address1 && !record.city && !record.state) {
    // Try to extract city/state from address1 for matching purposes
    const parts = record.address1.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      return [parts[0], parts[1], parts[2] || ''].filter(Boolean).join(' ');
    }
    return record.address1;
  }
  
  // Use structured address fields
  return [record.address1, record.city, record.state].filter(Boolean).join(' ');
};

// ==================== RECORD LINKING FUNCTIONS ====================
const linkRecords = (orderRecords, commissionRecords) => {
  const linkedRecords = [];
  const usedCommissionRecords = new Set();
  
  // Primary linking by account number
  orderRecords.forEach(orderRecord => {
    if (!orderRecord.accountNumber) return;
    
    const normalizedOrderAccount = normalizeAccountNumber(orderRecord.accountNumber);
    
    const matchedCommissions = commissionRecords.filter((commissionRecord, index) => {
      if (usedCommissionRecords.has(index) || !commissionRecord.accountNumber) return false;
      
      const normalizedCommissionAccount = normalizeAccountNumber(commissionRecord.accountNumber);
      return normalizedOrderAccount === normalizedCommissionAccount;
    });
    
    if (matchedCommissions.length > 0) {
      matchedCommissions.forEach(commissionRecord => {
        const commissionIndex = commissionRecords.indexOf(commissionRecord);
        usedCommissionRecords.add(commissionIndex);
        
        linkedRecords.push({
          ...orderRecord,
          // For matched records, prioritize order file location data
          // Only use commission location if order location is incomplete
          address1: orderRecord.address1 || commissionRecord.address1 || '',
          address2: orderRecord.address2 || commissionRecord.address2 || '',
          city: orderRecord.city || commissionRecord.city || '',
          state: orderRecord.state || commissionRecord.state || '',
          zipCode: orderRecord.zipCode || commissionRecord.zipCode || '',
          // Override with commission data where available
          product: commissionRecord.product || orderRecord.product,
          commissionAmount: commissionRecord.commissionAmount || 0,
          commissionPercent: commissionRecord.commissionPercent || 0,
          netBilled: commissionRecord.netBilled || orderRecord.netBilled || 0,
          invoiceDate: commissionRecord.invoiceDate || orderRecord.invoiceDate,
          linkType: 'account_match',
          linkedCommissionData: commissionRecord
        });
      });
    } else {
      // No commission match found, add order record without commission data
      // Order records keep their original location data
      linkedRecords.push({
        ...orderRecord,
        commissionAmount: 0,
        commissionPercent: 0,
        linkType: 'order_only'
      });
    }
  });
  
  // Secondary linking by address for remaining commission records
  const remainingCommissionRecords = commissionRecords.filter((_, index) => !usedCommissionRecords.has(index));
  
  remainingCommissionRecords.forEach(commissionRecord => {
    if (!commissionRecord.companyName) return;
    
    const commissionAddress = getAddressForMatching(commissionRecord);
    
    if (!commissionAddress) return;
    
    let bestMatch = null;
    let bestScore = 0;
    
    linkedRecords.forEach(linkedRecord => {
      if (linkedRecord.linkType !== 'order_only') return;
      
      // Company name similarity
      const companyNameMatch = linkedRecord.companyName.toLowerCase().includes(commissionRecord.companyName.toLowerCase()) ||
                              commissionRecord.companyName.toLowerCase().includes(linkedRecord.companyName.toLowerCase());
      
      if (!companyNameMatch) return;
      
      const orderAddress = getAddressForMatching(linkedRecord);
      
      const addressScore = addressSimilarity(orderAddress, commissionAddress);
      
      if (addressScore > 0.6 && addressScore > bestScore) {
        bestMatch = linkedRecord;
        bestScore = addressScore;
      }
    });
    
    if (bestMatch) {
      // Update the best match with commission data
      // For address matches, fill in missing location fields from commission if order data is incomplete
      if (!bestMatch.address1 && commissionRecord.address1) {
        bestMatch.address1 = commissionRecord.address1;
      }
      if (!bestMatch.city && commissionRecord.city) {
        bestMatch.city = commissionRecord.city;
      }
      if (!bestMatch.state && commissionRecord.state) {
        bestMatch.state = commissionRecord.state;
      }
      if (!bestMatch.zipCode && commissionRecord.zipCode) {
        bestMatch.zipCode = commissionRecord.zipCode;
      }
      
      bestMatch.product = commissionRecord.product || bestMatch.product;
      bestMatch.commissionAmount = commissionRecord.commissionAmount || 0;
      bestMatch.commissionPercent = commissionRecord.commissionPercent || 0;
      bestMatch.netBilled = commissionRecord.netBilled || bestMatch.netBilled || 0;
      bestMatch.invoiceDate = commissionRecord.invoiceDate || bestMatch.invoiceDate;
      bestMatch.linkType = 'address_match';
      bestMatch.addressMatchScore = bestScore;
      bestMatch.linkedCommissionData = commissionRecord;
    } else {
      // Add commission record without order data
      // Commission-only records use whatever location data is available
      linkedRecords.push({
        companyName: commissionRecord.companyName,
        locationName: commissionRecord.locationName || '',
        address1: commissionRecord.address1 || '',
        address2: commissionRecord.address2 || '',
        city: commissionRecord.city || '',
        state: commissionRecord.state || '',
        zipCode: commissionRecord.zipCode || '',
        product: commissionRecord.product || '',
        commissionAmount: commissionRecord.commissionAmount || 0,
        commissionPercent: commissionRecord.commissionPercent || 0,
        netBilled: commissionRecord.netBilled || 0,
        monthlyRecurring: 0,
        salesRep: commissionRecord.salesRep || '',
        invoiceDate: commissionRecord.invoiceDate,
        source: commissionRecord.source,
        linkType: 'commission_only',
        linkedCommissionData: commissionRecord
      });
    }
  });
  
  return linkedRecords;
};

// ==================== STEP COMPONENTS ====================
const FileUploadStep = memo(({ onFileUpload }) => {
  const acceptedTypes = '.csv,.xlsx,.xls';

  return (
    <div className="space-y-6">
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <div className="text-lg font-medium text-gray-700 mb-2">
          Upload Order & Commission Files
        </div>
        <div className="text-gray-500 mb-4">
          Select order reports and commission statements from telecom providers
        </div>
        <input
          type="file"
          multiple
          accept={acceptedTypes}
          onChange={onFileUpload}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 cursor-pointer transition-colors"
        >
          Choose Files
        </label>
      </div>
    </div>
  );
});

const WorksheetSelectionStep = memo(({ filesWithWorksheets, onWorksheetSelection, onContinue }) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
        <FileText className="text-blue-600" />
        Select Worksheets
      </h2>
      <button
        onClick={onContinue}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        Continue to Mapping
      </button>
    </div>

    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <p className="text-sm text-blue-700">
        <strong>Multiple worksheets detected:</strong> Please select the correct worksheet for each Excel file below.
      </p>
    </div>

    <div className="space-y-4">
      {filesWithWorksheets.map((file, fileIndex) => (
        <div key={fileIndex} className="border rounded-lg p-4">
          <h3 className="font-medium text-gray-800 mb-4">{file.name}</h3>
          
          <div className="space-y-3">
            {file.worksheets.map((worksheet, worksheetIndex) => (
              <label key={worksheetIndex} className="flex items-start gap-3 cursor-pointer p-3 border rounded-md hover:bg-gray-50">
                <input
                  type="radio"
                  name={`worksheet-${fileIndex}`}
                  value={worksheetIndex}
                  checked={file.selectedWorksheetIndex === worksheetIndex}
                  onChange={(e) => onWorksheetSelection(fileIndex, parseInt(e.target.value))}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-800">{worksheet.name}</span>
                    {file.recommendedWorksheetIndex === worksheetIndex && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                        Recommended
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {worksheet.rowCount} rows, {worksheet.columnCount} columns
                  </div>
                  {worksheet.sampleHeaders.length > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      Headers: {worksheet.sampleHeaders.slice(0, 5).join(', ')}
                      {worksheet.sampleHeaders.length > 5 && '...'}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
));

const MappingProgress = memo(({ files, columnMappings }) => (
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
    <h3 className="font-medium text-blue-800 mb-2">Mapping Progress</h3>
    <div className="space-y-2">
      {Object.entries(FIELD_CATEGORIES).map(([categoryKey, categoryData]) => {
        const requiredCount = REQUIRED_FIELDS[categoryKey]?.length || 0;
        const mappedCount = files.reduce((count, file, fileIndex) => {
          const fileMappings = columnMappings[fileIndex] || {};
          const categoryMapped = Object.keys(categoryData.fields).filter(field => 
            fileMappings[field] && fileMappings[field] !== 'none'
          ).length;
          return count + categoryMapped;
        }, 0);
        
        return (
          <div key={categoryKey} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {categoryData.icon}
              <span>{categoryData.label}</span>
            </div>
            <span className={`px-2 py-1 rounded text-xs ${
              requiredCount > 0 && mappedCount === 0 
                ? 'bg-red-100 text-red-700' 
                : mappedCount > 0 
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
            }`}>
              {mappedCount} field{mappedCount !== 1 ? 's' : ''} mapped
            </span>
          </div>
        );
      })}
    </div>
  </div>
));

const ColumnMappingStep = memo(({ 
  files, 
  columnMappings, 
  primaryFileIndex, 
  mappingName, 
  onUpdateMapping, 
  onSetPrimaryFile, 
  onProcessFiles, 
  onSetMappingName, 
  onExportMapping, 
  onImportMapping 
}) => {
  const [activeTab, setActiveTab] = useState('customer');

  const getFileTypeIcon = (fileType) => {
    switch (fileType) {
      case FILE_TYPES.ORDER:
        return <FileCheck className="text-green-600" size={16} />;
      case FILE_TYPES.COMMISSION:
        return <DollarSign className="text-blue-600" size={16} />;
      default:
        return <FileText className="text-gray-500" size={16} />;
    }
  };

  const getFileTypeLabel = (fileType) => {
    switch (fileType) {
      case FILE_TYPES.ORDER:
        return 'Order File';
      case FILE_TYPES.COMMISSION:
        return 'Commission File';
      default:
        return 'Unknown Type';
    }
  };

  const renderFieldMapping = (category, categoryData) => {
    return (
      <div key={category} className="space-y-4">
        {files.map((file, fileIndex) => (
          <div key={fileIndex} className={`border rounded-lg p-4 ${
            fileIndex === primaryFileIndex ? 'border-blue-300 bg-blue-50' : ''
          }`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-800">{file.name}</h3>
              <div className="flex items-center gap-2">
                {fileIndex === primaryFileIndex && (
                  <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded">
                    Primary File
                  </span>
                )}
                <div className="flex items-center gap-1">
                  {getFileTypeIcon(file.fileType)}
                  <span className="text-xs text-gray-500">
                    {getFileTypeLabel(file.fileType)} - {detectProviderType(file.name, file.headers)}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Object.entries(categoryData.fields).map(([fieldType, fieldLabel]) => (
                <div key={fieldType}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {fieldLabel}
                    {REQUIRED_FIELDS[category]?.includes(fieldType) && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </label>
                  <select
                    value={columnMappings[fileIndex]?.[fieldType] || 'none'}
                    onChange={(e) => onUpdateMapping(fileIndex, fieldType, e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      REQUIRED_FIELDS[category]?.includes(fieldType) && 
                      (!columnMappings[fileIndex]?.[fieldType] || columnMappings[fileIndex]?.[fieldType] === 'none')
                        ? 'border-red-300' 
                        : 'border-gray-300'
                    }`}
                  >
                    <option value="none">-- None --</option>
                    {file.headers.map((header, headerIndex) => (
                      <option key={`${fileIndex}-${headerIndex}-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <Settings className="text-blue-600" />
          Enhanced Column Mapping
        </h2>
        <button
          onClick={onProcessFiles}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Process Files
        </button>
      </div>

      {/* File Type Overview */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
          <Link className="text-purple-600" size={16} />
          File Type Detection
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {files.map((file, index) => (
            <div key={index} className="flex items-center gap-2 p-2 bg-white border rounded">
              {getFileTypeIcon(file.fileType)}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-700 truncate">{file.name}</div>
                <div className="text-xs text-gray-500">{getFileTypeLabel(file.fileType)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mapping Save/Load Section */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
          <Download className="text-green-600" size={16} />
          Save/Load Field Mappings
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Save Current Mapping
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={mappingName}
                onChange={(e) => onSetMappingName(e.target.value)}
                placeholder="Enter mapping name..."
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={onExportMapping}
                disabled={!mappingName.trim()}
                className={`px-4 py-2 rounded-md border ${
                  !mappingName.trim()
                    ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                    : 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                }`}
              >
                Save
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Load Saved Mapping
            </label>
            <input
              type="file"
              accept=".json"
              onChange={onImportMapping}
              className="w-full border border-gray-300 rounded-md px-3 py-2 file:mr-4 file:py-1 file:px-4 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
        </div>
      </div>

      {/* Primary File Selection */}
      {files.length > 1 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-800 mb-3">Select Primary File</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {files.map((file, index) => (
              <label key={index} className="flex items-center gap-2 cursor-pointer p-2 border rounded hover:bg-yellow-100">
                <input
                  type="radio"
                  name="primaryFile"
                  value={index}
                  checked={primaryFileIndex === index}
                  onChange={(e) => onSetPrimaryFile(parseInt(e.target.value))}
                  className="text-blue-600"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-700 truncate block">{file.name}</span>
                  <span className="text-xs text-gray-500">
                    {getFileTypeLabel(file.fileType)} - {detectProviderType(file.name, file.headers)}
                  </span>
                </div>
                {primaryFileIndex === index && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    Primary
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Category Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-4 lg:space-x-8 overflow-x-auto">
          {Object.entries(FIELD_CATEGORIES).map(([categoryKey, categoryData]) => (
            <button
              key={categoryKey}
              onClick={() => setActiveTab(categoryKey)}
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap ${
                activeTab === categoryKey
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {categoryData.icon}
              {categoryData.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Active Tab Content */}
      <div className="mt-6">
        {renderFieldMapping(activeTab, FIELD_CATEGORIES[activeTab])}
      </div>

      {/* Progress Indicator */}
      <MappingProgress files={files} columnMappings={columnMappings} />
    </div>
  );
});

const LinkingStep = memo(({ linkingResults, onContinue }) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
        <Link className="text-blue-600" />
        Record Linking Results
      </h2>
      <button
        onClick={onContinue}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        Continue to Results
      </button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <CheckCircle className="text-green-600" size={20} />
          <span className="font-medium text-green-800">Account Matches</span>
        </div>
        <div className="text-2xl font-bold text-green-900 mt-1">
          {linkingResults.accountMatches}
        </div>
        <div className="text-sm text-green-700 mt-1">
          Perfect account number matches
        </div>
      </div>
      
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-yellow-600" size={20} />
          <span className="font-medium text-yellow-800">Address Matches</span>
        </div>
        <div className="text-2xl font-bold text-yellow-900 mt-1">
          {linkingResults.addressMatches}
        </div>
        <div className="text-sm text-yellow-700 mt-1">
          Matched by address similarity
        </div>
      </div>
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Info className="text-blue-600" size={20} />
          <span className="font-medium text-blue-800">Total Records</span>
        </div>
        <div className="text-2xl font-bold text-blue-900 mt-1">
          {linkingResults.totalRecords}
        </div>
        <div className="text-sm text-blue-700 mt-1">
          Combined order & commission data
        </div>
      </div>
    </div>

    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <h3 className="font-medium text-blue-800 mb-2">Linking Summary</h3>
      <div className="space-y-2 text-sm text-blue-700">
        <div>• {linkingResults.accountMatches} records linked by exact account number match</div>
        <div>• {linkingResults.addressMatches} records linked by address similarity (60%+ match)</div>
        <div>• {linkingResults.orderOnly} order records without commission data</div>
        <div>• {linkingResults.commissionOnly} commission records without order data</div>
      </div>
    </div>
  </div>
));

const SummaryCards = memo(({ filteredData }) => {
  const totals = useMemo(() => {
    const uniqueCompanies = new Set(filteredData.map(record => record.companyName.toLowerCase().trim())).size;
    
    return {
      companies: uniqueCompanies,
      locations: filteredData.length,
      services: filteredData.reduce((sum, record) => sum + record.serviceCount, 0),
      mrc: filteredData.reduce((sum, record) => sum + record.totalMRC, 0),
      commission: filteredData.reduce((sum, record) => sum + record.totalCommission, 0)
    };
  }, [filteredData]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <FileCheck className="text-indigo-600" size={20} />
          <span className="font-medium text-indigo-800">Total Companies</span>
        </div>
        <div className="text-2xl font-bold text-indigo-900 mt-1">{totals.companies}</div>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Users className="text-blue-600" size={20} />
          <span className="font-medium text-blue-800">Total Locations</span>
        </div>
        <div className="text-2xl font-bold text-blue-900 mt-1">{totals.locations}</div>
      </div>
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Package className="text-green-600" size={20} />
          <span className="font-medium text-green-800">Total Services</span>
        </div>
        <div className="text-2xl font-bold text-green-900 mt-1">{totals.services}</div>
      </div>
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <DollarSign className="text-purple-600" size={20} />
          <span className="font-medium text-purple-800">Total MRC</span>
        </div>
        <div className="text-2xl font-bold text-purple-900 mt-1">
          ${totals.mrc.toFixed(0)}
        </div>
      </div>
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-orange-600" size={20} />
          <span className="font-medium text-orange-800">Total Commission</span>
        </div>
        <div className="text-2xl font-bold text-orange-900 mt-1">
          ${totals.commission.toFixed(0)}
        </div>
      </div>
    </div>
  );
});

const ServiceDetailsModal = memo(({ isOpen, location, onClose }) => {
  if (!isOpen || !location) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Service Details - {location.companyName}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl p-1"
          >
            ×
          </button>
        </div>
        
        <div className="space-y-6">
          {/* Location Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-800 mb-2">Location Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div><strong>Address 1:</strong> {location.address1}</div>
                <div><strong>Address 2:</strong> {location.address2}</div>
                <div><strong>City:</strong> {location.city}</div>
                <div><strong>State:</strong> {location.state}</div>
                <div><strong>Zip Code:</strong> {location.zipCode}</div>
                {location.linkType && (
                  <div><strong>Link Type:</strong> 
                    <span className={`ml-2 px-2 py-1 rounded text-xs ${
                      location.linkType === 'account_match' ? 'bg-green-100 text-green-700' :
                      location.linkType === 'address_match' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {location.linkType.replace('_', ' ')}
                    </span>
                  </div>
                )}
              </div>
              <div>
                <div><strong>Total Services:</strong> {location.serviceCount}</div>
                <div><strong>Total MRC:</strong> ${location.totalMRC.toFixed(2)}</div>
                <div><strong>Total Commission:</strong> ${location.totalCommission.toFixed(2)}</div>
                <div><strong>Net Billed:</strong> ${(location.totalNetBilled || 0).toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Services Table */}
          <div>
            <h3 className="font-medium text-gray-800 mb-3">Individual Services</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-left">Product</th>
                    <th className="border border-gray-300 px-3 py-2 text-left">MRC</th>
                    <th className="border border-gray-300 px-3 py-2 text-left">Net Billed</th>
                    <th className="border border-gray-300 px-3 py-2 text-left">Commission</th>
                    <th className="border border-gray-300 px-3 py-2 text-left">Sales Rep</th>
                    <th className="border border-gray-300 px-3 py-2 text-left">Install Date</th>
                    <th className="border border-gray-300 px-3 py-2 text-left">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {location.services.map((service, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-300 px-3 py-2">{service.product}</td>
                      <td className="border border-gray-300 px-3 py-2">${service.monthlyRecurring.toFixed(2)}</td>
                      <td className="border border-gray-300 px-3 py-2">${(service.netBilled || 0).toFixed(2)}</td>
                      <td className="border border-gray-300 px-3 py-2">${service.commissionAmount.toFixed(2)}</td>
                      <td className="border border-gray-300 px-3 py-2">{service.salesRep}</td>
                      <td className="border border-gray-300 px-3 py-2">{service.installDate}</td>
                      <td className="border border-gray-300 px-3 py-2 text-sm">{service.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});

const EditableCell = memo(({ record, field, originalIndex, editingCell, onCellEdit, onCellClick, onCellBlur }) => {
  const isEditing = editingCell?.recordIndex === originalIndex && editingCell?.field === field;
  const value = record[field] || '';

  if (isEditing) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onCellEdit(originalIndex, field, e.target.value)}
        onBlur={onCellBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') {
            onCellBlur();
          }
        }}
        className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoFocus
      />
    );
  }

  return (
    <div
      onClick={() => onCellClick(originalIndex, field)}
      className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded min-h-[24px] flex items-center group"
      title="Click to edit"
    >
      <span className="flex-1">{value}</span>
      <Edit3 size={12} className="opacity-0 group-hover:opacity-50 ml-1" />
    </div>
  );
});

const ResultsStep = memo(({ 
  processedData, 
  filteredData, 
  selectedRecords, 
  selectedCount, 
  showMissingAddresses, 
  showDuplicates, 
  editingCell, 
  isStandardizing, 
  files, 
  primaryFileIndex, 
  onToggleRecordSelection, 
  onToggleSelectAll, 
  onCellEdit, 
  onCellClick, 
  onCellBlur, 
  onToggleMissingAddresses, 
  onToggleDuplicates, 
  onStandardizeSelected, 
  onExport, 
  onReset, 
  onViewServiceDetails 
}) => {
  const allVisibleSelected = useMemo(() => 
    filteredData.length > 0 && 
    filteredData.every(record => selectedRecords.has(processedData.indexOf(record))),
    [filteredData, processedData, selectedRecords]
  );

  const totalCompanies = useMemo(() => 
    new Set(filteredData.map(record => record.companyName.toLowerCase().trim())).size,
    [filteredData]
  );

  const getLinkTypeDisplay = (linkType) => {
    switch (linkType) {
      case 'account_match':
        return <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Account Match</span>;
      case 'address_match':
        return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">Address Match</span>;
      case 'order_only':
        return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">Order Only</span>;
      case 'commission_only':
        return <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">Commission Only</span>;
      default:
        return <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">Unknown</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-gray-800">
          Enhanced Results ({totalCompanies} companies, {filteredData.length} locations, {selectedCount} selected)
        </h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={onStandardizeSelected}
            disabled={selectedRecords.size === 0 || isStandardizing}
            className={`px-4 py-2 rounded-md border flex items-center gap-2 ${
              selectedRecords.size === 0 || isStandardizing
                ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                : 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700'
            }`}
          >
            <Settings size={16} className={isStandardizing ? 'animate-spin' : ''} />
            {isStandardizing ? 'Processing with AI...' : `Standardize with AI (${selectedRecords.size})`}
          </button>
          <button
            onClick={onToggleMissingAddresses}
            className={`px-4 py-2 rounded-md border flex items-center gap-2 ${
              showMissingAddresses
                ? 'bg-gray-100 text-gray-700 border-gray-300'
                : 'bg-blue-100 text-blue-700 border-blue-300'
            }`}
          >
            {showMissingAddresses ? <EyeOff size={16} /> : <Eye size={16} />}
            {showMissingAddresses ? 'Hide' : 'Show'} Missing Address
          </button>
          <button
            onClick={onToggleDuplicates}
            className={`px-4 py-2 rounded-md border flex items-center gap-2 ${
              showDuplicates
                ? 'bg-gray-100 text-gray-700 border-gray-300'
                : 'bg-orange-100 text-orange-700 border-orange-300'
            }`}
          >
            {showDuplicates ? <EyeOff size={16} /> : <Eye size={16} />}
            {showDuplicates ? 'Hide' : 'Show'} Duplicates
          </button>
          <button
            onClick={onExport}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      <SummaryCards filteredData={filteredData} />

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-blue-700 flex items-center gap-2">
          <Edit3 size={16} />
          <strong>Tip:</strong> Click on cells to edit. Click service count to view detailed service breakdown. 
          Use "Standardize Selected" to clean and parse addresses using Gemini AI into separate Address 1, City, State, and Zip Code fields. 
          Link types show how order and commission data were matched.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2 text-left">
                <input
                  type="checkbox"
                  onChange={onToggleSelectAll}
                  checked={allVisibleSelected}
                  className="rounded"
                />
              </th>
              <th className="border border-gray-300 px-4 py-2 text-left">Company Name</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Address 1</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Address 2</th>
              <th className="border border-gray-300 px-4 py-2 text-left">City</th>
              <th className="border border-gray-300 px-4 py-2 text-left">State</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Zip Code</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Services</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Total MRC</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Net Billed</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Commission</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Primary Rep</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Link Type</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((record, index) => {
              let rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';

              if (record.isDuplicate) {
                rowClass = 'bg-yellow-100';
              } else if (record.isSimilar) {
                rowClass = 'bg-red-100';
              } else if (record.isStandardized) {
                rowClass = index % 2 === 0 ? 'bg-green-50' : 'bg-green-100';
              }

              const originalIndex = processedData.indexOf(record);

              return (
                <tr key={index} className={rowClass}>
                  <td className="border border-gray-300 px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={originalIndex !== -1 && selectedRecords.has(originalIndex)}
                      onChange={() => originalIndex !== -1 && onToggleRecordSelection(originalIndex)}
                      className="rounded"
                    />
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    <EditableCell 
                      record={record} 
                      field="companyName" 
                      originalIndex={originalIndex}
                      editingCell={editingCell}
                      onCellEdit={onCellEdit}
                      onCellClick={onCellClick}
                      onCellBlur={onCellBlur}
                    />
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    <EditableCell 
                      record={record} 
                      field="address1" 
                      originalIndex={originalIndex}
                      editingCell={editingCell}
                      onCellEdit={onCellEdit}
                      onCellClick={onCellClick}
                      onCellBlur={onCellBlur}
                    />
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    <EditableCell 
                      record={record} 
                      field="address2" 
                      originalIndex={originalIndex}
                      editingCell={editingCell}
                      onCellEdit={onCellEdit}
                      onCellClick={onCellClick}
                      onCellBlur={onCellBlur}
                    />
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    <EditableCell 
                      record={record} 
                      field="city" 
                      originalIndex={originalIndex}
                      editingCell={editingCell}
                      onCellEdit={onCellEdit}
                      onCellClick={onCellClick}
                      onCellBlur={onCellBlur}
                    />
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    <EditableCell 
                      record={record} 
                      field="state" 
                      originalIndex={originalIndex}
                      editingCell={editingCell}
                      onCellEdit={onCellEdit}
                      onCellClick={onCellClick}
                      onCellBlur={onCellBlur}
                    />
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    <EditableCell 
                      record={record} 
                      field="zipCode" 
                      originalIndex={originalIndex}
                      editingCell={editingCell}
                      onCellEdit={onCellEdit}
                      onCellClick={onCellClick}
                      onCellBlur={onCellBlur}
                    />
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-center">
                    {record.serviceCount > 0 ? (
                      <button
                        onClick={() => onViewServiceDetails(record)}
                        className="bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors"
                      >
                        {record.serviceCount} service{record.serviceCount !== 1 ? 's' : ''}
                      </button>
                    ) : (
                      <span className="text-gray-500">0 services</span>
                    )}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-right">
                    ${record.totalMRC.toFixed(2)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-right">
                    ${(record.totalNetBilled || 0).toFixed(2)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-right">
                    ${record.totalCommission.toFixed(2)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-sm">
                    {record.primarySalesRep}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-sm">
                    {getLinkTypeDisplay(record.linkType)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onReset}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
        >
          Start Over
        </button>
        <div className="flex gap-4 text-sm text-gray-600 items-center flex-wrap">
          <div className="flex items-center">
            <input type="checkbox" checked readOnly className="mr-2 rounded" />
            Select for export
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-100 border border-green-300 mr-2" />
            Account match
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 mr-2" />
            Address match
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-blue-100 border border-blue-300 mr-2" />
            Order only
          </div>
          <div className="flex items-center">
            <Edit3 size={14} className="mr-2 text-gray-400" />
            Click cells to edit
          </div>
        </div>
      </div>
    </div>
  );
});

const StepIndicator = memo(({ currentStep }) => {
  const stepLabels = {
    1: 'Upload Files',
    1.5: 'Select Worksheets',
    2: 'Map Columns',
    2.5: 'Link Records',
    3: 'Review Results'
  };

  const getDisplaySteps = () => {
    if (currentStep === 1.5) return [1, 1.5, 2, 2.5, 3];
    if (currentStep === 2.5) return [1, 2, 2.5, 3];
    return [1, 2, 3];
  };

  const displaySteps = getDisplaySteps();

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {displaySteps.map((stepNumber, index) => (
          <div key={stepNumber} className={`flex items-center ${index < displaySteps.length - 1 ? 'flex-1' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              currentStep >= stepNumber ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
            }`}>
              {stepNumber === 1.5 ? '📊' : stepNumber === 2.5 ? '🔗' : Math.floor(stepNumber)}
            </div>
            <span className={`ml-2 text-sm ${currentStep >= stepNumber ? 'text-blue-600' : 'text-gray-500'}`}>
              {stepLabels[stepNumber]}
            </span>
            {index < displaySteps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-4 ${currentStep > stepNumber ? 'bg-blue-600' : 'bg-gray-300'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

const ProgressIndicator = memo(({ current, total }) => {
  const percentage = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-blue-700">
          Standardizing Records...
        </span>
        <span className="text-sm text-blue-600">
          {current} of {total}
        </span>
      </div>
      <div className="w-full bg-blue-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-blue-600 mt-1">
        Please wait while we process your records through the Gemini AI standardization API...
      </p>
    </div>
  );
});

// ==================== MAIN HOOK ====================
const useTelecomExtractor = () => {
  const [files, setFiles] = useState([]);
  const [filesWithWorksheets, setFilesWithWorksheets] = useState([]);
  const [processedData, setProcessedData] = useState([]);
  const [columnMappings, setColumnMappings] = useState({});
  const [primaryFileIndex, setPrimaryFileIndex] = useState(0);
  const [showMissingAddresses, setShowMissingAddresses] = useState(true);
  const [showDuplicates, setShowDuplicates] = useState(true);
  const [selectedRecords, setSelectedRecords] = useState(new Set());
  const [editingCell, setEditingCell] = useState(null);
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [isStandardizing, setIsStandardizing] = useState(false);
  const [standardizationProgress, setStandardizationProgress] = useState({ current: 0, total: 0 });
  const [mappingName, setMappingName] = useState('');
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [linkingResults, setLinkingResults] = useState({});

  const { notifications, removeNotification, showSuccess, showError, showWarning, showInfo } = useSnackbar();

  // Enhanced processing logic with record linking
  const processFilesEnhanced = useCallback(async () => {
    try {
      const orderFiles = files.filter(file => file.fileType === FILE_TYPES.ORDER);
      const commissionFiles = files.filter(file => file.fileType === FILE_TYPES.COMMISSION);
      
      // Process order records
      const orderRecords = [];
      for (const file of orderFiles) {
        const fileIndex = files.indexOf(file);
        const mapping = columnMappings[fileIndex];
        if (!mapping?.companyName) continue;

        const processedRows = file.data
          .filter(row => row[mapping.companyName]?.trim())
          .map(row => {
            // Parse address fields using the new utility
            const addressFields = parseAddressFields(null, mapping, row);

            return {
              companyName: (row[mapping.companyName] || '').trim(),
              locationName: mapping.locationName ? (row[mapping.locationName] || '').trim() : '',
              address1: addressFields.address1,
              address2: addressFields.address2,
              city: addressFields.city,
              state: addressFields.state,
              zipCode: addressFields.zipCode,
              product: mapping.product ? (row[mapping.product] || '').trim() : '',
              quantity: mapping.quantity ? parseInt(row[mapping.quantity]) || 1 : 1,
              monthlyRecurring: parseMonetary(mapping.monthlyRecurring ? row[mapping.monthlyRecurring] : 0),
              nonRecurring: parseMonetary(mapping.nonRecurring ? row[mapping.nonRecurring] : 0),
              contractValue: parseMonetary(mapping.contractValue ? row[mapping.contractValue] : 0),
              contractTerm: mapping.contractTerm ? parseInt(row[mapping.contractTerm]) || 0 : 0,
              salesRep: mapping.salesRep ? (row[mapping.salesRep] || '').trim() : '',
              accountNumber: mapping.accountNumber ? (row[mapping.accountNumber] || '').trim() : '',
              orderNumber: mapping.orderNumber ? (row[mapping.orderNumber] || '').trim() : '',
              supplier: mapping.supplier ? (row[mapping.supplier] || '').trim() : '',
              installDate: parseDate(mapping.installDate ? row[mapping.installDate] : null),
              activationDate: parseDate(mapping.activationDate ? row[mapping.activationDate] : null),
              contractDate: parseDate(mapping.contractDate ? row[mapping.contractDate] : null),
              expirationDate: parseDate(mapping.expirationDate ? row[mapping.expirationDate] : null),
              orderDate: parseDate(mapping.orderDate ? row[mapping.orderDate] : null),
              source: file.name,
              fileType: FILE_TYPES.ORDER
            };
          });

        orderRecords.push(...processedRows);
      }

      // Process commission records
      const commissionRecords = [];
      for (const file of commissionFiles) {
        const fileIndex = files.indexOf(file);
        const mapping = columnMappings[fileIndex];
        if (!mapping?.companyName) continue;

        const processedRows = file.data
          .filter(row => row[mapping.companyName]?.trim())
          .map(row => {
            // Parse address fields using the new utility
            const addressFields = parseAddressFields(null, mapping, row);

            return {
              companyName: (row[mapping.companyName] || '').trim(),
              address1: addressFields.address1,
              address2: addressFields.address2,
              city: addressFields.city,
              state: addressFields.state,
              zipCode: addressFields.zipCode,
              product: mapping.product ? (row[mapping.product] || '').trim() : '',
              quantity: mapping.quantity ? parseInt(row[mapping.quantity]) || 1 : 1,
              netBilled: parseMonetary(mapping.netBilled ? row[mapping.netBilled] : 0),
              commissionAmount: parseMonetary(mapping.commissionAmount ? row[mapping.commissionAmount] : 0),
              commissionPercent: mapping.commissionPercent ? parseFloat(row[mapping.commissionPercent]) || 0 : 0,
              commissionType: mapping.commissionType ? (row[mapping.commissionType] || '').trim() : '',
              salesRep: mapping.salesRep ? (row[mapping.salesRep] || '').trim() : '',
              accountNumber: mapping.accountNumber ? (row[mapping.accountNumber] || '').trim() : '',
              invoiceDate: parseDate(mapping.invoiceDate ? row[mapping.invoiceDate] : null),
              installDate: parseDate(mapping.installDate ? row[mapping.installDate] : null),
              source: file.name,
              fileType: FILE_TYPES.COMMISSION
            };
          });

        commissionRecords.push(...processedRows);
      }

      // Link order and commission records
      const linkedRecords = linkRecords(orderRecords, commissionRecords);

      // Calculate linking statistics
      const linkingStats = {
        accountMatches: linkedRecords.filter(r => r.linkType === 'account_match').length,
        addressMatches: linkedRecords.filter(r => r.linkType === 'address_match').length,
        orderOnly: linkedRecords.filter(r => r.linkType === 'order_only').length,
        commissionOnly: linkedRecords.filter(r => r.linkType === 'commission_only').length,
        totalRecords: linkedRecords.length
      };

      setLinkingResults(linkingStats);

      // Show linking step
      setStep(STEPS.LINKING);
      showSuccess(
        `Successfully linked ${linkingStats.accountMatches} records by account number and ${linkingStats.addressMatches} by address. Total: ${linkingStats.totalRecords} records.`,
        'Record Linking Complete'
      );

      // Continue processing to aggregate by location
      setTimeout(() => {
        const locationMap = new Map();

        linkedRecords.forEach(record => {
          const locationKey = `${record.companyName.toLowerCase().trim()}_${record.address1.toLowerCase().trim()}_${record.city.toLowerCase().trim()}`;

          if (!locationMap.has(locationKey)) {
            locationMap.set(locationKey, {
              companyName: record.companyName,
              locationName: record.locationName || '',
              address1: record.address1,
              address2: record.address2 || '',
              city: record.city,
              state: record.state,
              zipCode: record.zipCode,
              hasCompleteAddress: Boolean(
                record.address1 && 
                (record.city || record.state) // Allow some flexibility - either city OR state must be present
              ),
              services: [],
              totalMRC: 0,
              totalNRC: 0,
              totalNetBilled: 0,
              totalRevenue: 0,
              totalCommission: 0,
              serviceCount: 0,
              primarySalesRep: '',
              primarySupplier: '',
              sources: new Set(),
              linkType: record.linkType,
              isStandardized: false,
              isDuplicate: false,
              isSimilar: false
            });
          }

          const location = locationMap.get(locationKey);

          if (record.product || record.monthlyRecurring > 0 || record.commissionAmount > 0) {
            location.services.push({
              product: record.product,
              quantity: record.quantity,
              monthlyRecurring: record.monthlyRecurring,
              nonRecurring: record.nonRecurring,
              netBilled: record.netBilled || 0,
              commissionAmount: record.commissionAmount,
              commissionPercent: record.commissionPercent,
              commissionType: record.commissionType,
              salesRep: record.salesRep,
              installDate: record.installDate,
              activationDate: record.activationDate,
              contractDate: record.contractDate,
              invoiceDate: record.invoiceDate,
              expirationDate: record.expirationDate,
              orderDate: record.orderDate,
              accountNumber: record.accountNumber,
              orderNumber: record.orderNumber,
              supplier: record.supplier,
              source: record.source
            });

            location.totalMRC += record.monthlyRecurring;
            location.totalNRC += record.nonRecurring;
            location.totalNetBilled += record.netBilled || 0;
            location.totalCommission += record.commissionAmount;
            location.serviceCount = location.services.length;

            if (!location.primarySalesRep || record.fileType === FILE_TYPES.ORDER) {
              location.primarySalesRep = record.salesRep;
              location.primarySupplier = record.supplier;
            }
          }

          location.sources.add(record.source);
        });

        const processedData = Array.from(locationMap.values());

        // Apply deduplication logic (simplified for linked data)
        processedData.sort((a, b) => {
          const nameCompare = a.companyName.localeCompare(b.companyName);
          if (nameCompare !== 0) return nameCompare;
          return a.address1.localeCompare(b.address1);
        });

        setProcessedData(processedData);
        
        const initialSelection = new Set();
        processedData.forEach((record, index) => {
          if (record.hasCompleteAddress) {
            initialSelection.add(index);
          }
        });
        setSelectedRecords(initialSelection);
        
        setStep(STEPS.RESULTS);
        showSuccess(
          `Successfully processed ${processedData.length} unique locations with ${processedData.reduce((sum, loc) => sum + loc.serviceCount, 0)} total services.`,
          'Processing Complete'
        );
      }, 2000);
      
    } catch (error) {
      console.error('Error processing enhanced files:', error);
      showError('An error occurred while processing the files. Please try again.');
    }
  }, [files, columnMappings, showSuccess, showError]);

  // Enhanced export function with linking information
  const exportEnhancedData = useCallback(() => {
    try {
      const selectedData = processedData.filter((record, index) => selectedRecords.has(index));
      let finalExportData = [...selectedData];
      
      if (!showMissingAddresses) {
        finalExportData = finalExportData.filter(record => record.hasCompleteAddress);
      }
      if (!showDuplicates) {
        finalExportData = finalExportData.filter(record => !record.isDuplicate);
      }

      const createCSV = (headers, rows) => {
        const csvHeaders = headers.join(',');
        const csvRows = rows.map(row => 
          row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')
        );
        return [csvHeaders, ...csvRows].join('\n');
      };

      const downloadCSV = (content, filename) => {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      };

      // Customer Summary CSV with linking information
      const customerSummaryHeaders = [
        'Company Name', 'Location Name', 'Address 1', 'Address 2', 'City', 'State', 'Zip Code',
        'Service Count', 'Total MRC', 'Total Net Billed', 'Total Commission', 'Primary Sales Rep', 
        'Primary Supplier', 'Link Type', 'Sources'
      ];
      const customerSummaryRows = finalExportData.map(record => [
        record.companyName,
        record.locationName,
        record.address1,
        record.address2,
        record.city,
        record.state,
        record.zipCode,
        record.serviceCount,
        record.totalMRC.toFixed(2),
        record.totalNetBilled.toFixed(2),
        record.totalCommission.toFixed(2),
        record.primarySalesRep,
        record.primarySupplier,
        record.linkType || 'unknown',
        Array.from(record.sources).join('; ')
      ]);

      downloadCSV(createCSV(customerSummaryHeaders, customerSummaryRows), 'Customer_Summary_Linked.csv');

      // Service Details CSV with linking information
      const serviceDetailHeaders = [
        'Company Name', 'Address 1', 'Address 2', 'City', 'State', 'Zip Code',
        'Product', 'Quantity', 'Monthly Recurring', 'Net Billed', 'Commission Amount', 'Commission Percent',
        'Sales Rep', 'Supplier', 'Install Date', 'Contract Date', 'Invoice Date', 'Expiration Date',
        'Account Number', 'Order Number', 'Source File', 'Record Link Type'
      ];
      const serviceDetailRows = [];
      
      finalExportData.forEach(record => {
        if (record.services.length > 0) {
          record.services.forEach(service => {
            serviceDetailRows.push([
              record.companyName,
              record.address1,
              record.address2,
              record.city,
              record.state,
              record.zipCode,
              service.product,
              service.quantity,
              service.monthlyRecurring.toFixed(2),
              service.netBilled.toFixed(2),
              service.commissionAmount.toFixed(2),
              service.commissionPercent.toFixed(2),
              service.salesRep,
              service.supplier,
              service.installDate,
              service.contractDate,
              service.invoiceDate,
              service.expirationDate,
              service.accountNumber,
              service.orderNumber,
              service.source,
              record.linkType || 'unknown'
            ]);
          });
        } else {
          serviceDetailRows.push([
            record.companyName,
            record.address1,
            record.address2,
            record.city,
            record.state,
            record.zipCode,
            '', '', '0.00', '0.00', '0.00', '0.00',
            record.primarySalesRep,
            record.primarySupplier,
            '', '', '', '',
            '', '',
            Array.from(record.sources).join('; '),
            record.linkType || 'unknown'
          ]);
        }
      });

      downloadCSV(createCSV(serviceDetailHeaders, serviceDetailRows), 'Service_Details_Linked.csv');

      showSuccess(
        `Downloaded Customer Summary (${finalExportData.length} locations) and Service Details (${serviceDetailRows.length} records) with linking information.`,
        'Export Complete'
      );
    } catch (error) {
      console.error('Error exporting enhanced data:', error);
      showError('An error occurred while exporting the data. Please try again.');
    }
  }, [processedData, selectedRecords, showMissingAddresses, showDuplicates, showSuccess, showError]);

  // Memoized computed values for better performance
  const filteredData = useMemo(() => {
    let filtered = [...processedData];
    if (!showMissingAddresses) {
      filtered = filtered.filter(record => record.hasCompleteAddress);
    }
    if (!showDuplicates) {
      filtered = filtered.filter(record => !record.isDuplicate);
    }
    return filtered;
  }, [processedData, showMissingAddresses, showDuplicates]);

  const selectedCount = useMemo(() => 
    filteredData.filter(record => {
      const originalIndex = processedData.indexOf(record);
      return originalIndex !== -1 && selectedRecords.has(originalIndex);
    }).length,
    [filteredData, processedData, selectedRecords]
  );

  // File upload handler with file type detection
  const handleFileUpload = useCallback(async (event) => {
    try {
      const uploadedFiles = Array.from(event.target.files);
      const fileData = [];
      const filesNeedingWorksheetSelection = [];

      for (const file of uploadedFiles) {
        let parsed;
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.csv')) {
          const content = await file.text();
          parsed = parseCSV(content);
          
          if (parsed.headers.length > 0 && parsed.data.length > 0) {
            const providerType = detectProviderType(file.name, parsed.headers);
            const fileType = detectFileType(file.name, parsed.headers);
            
            fileData.push({
              name: file.name,
              headers: parsed.headers,
              data: parsed.data,
              providerType,
              fileType
            });
          }
        } else if (fileName.match(/\.(xlsx|xls)$/)) {
          const buffer = await file.arrayBuffer();
          parsed = parseExcel(buffer);
          
          if (parsed.isMultiWorksheet) {
            filesNeedingWorksheetSelection.push({
              name: file.name,
              buffer: buffer,
              worksheets: parsed.worksheets,
              recommendedWorksheetIndex: parsed.recommendedWorksheetIndex,
              selectedWorksheetIndex: parsed.recommendedWorksheetIndex
            });
          } else if (parsed.headers.length > 0 && parsed.data.length > 0) {
            const providerType = detectProviderType(file.name, parsed.headers);
            const fileType = detectFileType(file.name, parsed.headers);
            
            fileData.push({
              name: file.name,
              headers: parsed.headers,
              data: parsed.data,
              providerType,
              fileType
            });
          }
        }
      }

      if (fileData.length === 0 && filesNeedingWorksheetSelection.length === 0) {
        showError('No valid files were processed. Please check your file formats.', 'Upload Failed');
        return;
      }

      if (filesNeedingWorksheetSelection.length > 0) {
        setFilesWithWorksheets(filesNeedingWorksheetSelection);
        setFiles(fileData);
        setStep(STEPS.WORKSHEET_SELECTION);
        showInfo(`Found multiple worksheets in ${filesNeedingWorksheetSelection.length} file(s). Please select the correct worksheets to continue.`, 'Worksheet Selection Required');
      } else {
        setFiles(fileData);
        
        const initialMappings = {};
        fileData.forEach((file, index) => {
          initialMappings[index] = detectEnhancedColumnMappings(file.headers, file.providerType, file.fileType);
        });
        setColumnMappings(initialMappings);

        const orderFileIndex = fileData.findIndex(file => file.fileType === FILE_TYPES.ORDER);
        setPrimaryFileIndex(orderFileIndex >= 0 ? orderFileIndex : 0);
        setStep(STEPS.MAPPING);
        
        const orderCount = fileData.filter(f => f.fileType === FILE_TYPES.ORDER).length;
        const commissionCount = fileData.filter(f => f.fileType === FILE_TYPES.COMMISSION).length;
        
        showSuccess(`Successfully processed ${fileData.length} file(s): ${orderCount} order file(s) and ${commissionCount} commission file(s). Enhanced column mappings have been automatically detected.`, 'Files Uploaded');
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      showError('An error occurred while processing the files. Please try again.');
    }
  }, [showSuccess, showError, showInfo]);

  // Other handlers with useCallback for performance
  const handleWorksheetSelection = useCallback((fileIndex, worksheetIndex) => {
    setFilesWithWorksheets(prev => {
      const updated = [...prev];
      updated[fileIndex].selectedWorksheetIndex = worksheetIndex;
      return updated;
    });
  }, []);

  const handleContinueFromWorksheetSelection = useCallback(async () => {
    try {
      const processedWorksheetFiles = [];
      
      for (const fileWithWorksheets of filesWithWorksheets) {
        const parsed = parseExcelWorksheet(fileWithWorksheets.buffer, fileWithWorksheets.selectedWorksheetIndex);
        
        if (parsed.headers.length > 0 && parsed.data.length > 0) {
          const providerType = detectProviderType(fileWithWorksheets.name, parsed.headers);
          const fileType = detectFileType(fileWithWorksheets.name, parsed.headers);
          
          processedWorksheetFiles.push({
            name: fileWithWorksheets.name,
            headers: parsed.headers,
            data: parsed.data,
            providerType,
            fileType
          });
        }
      }

      const allFiles = [...files, ...processedWorksheetFiles];
      setFiles(allFiles);

      const initialMappings = {};
      allFiles.forEach((file, index) => {
        initialMappings[index] = detectEnhancedColumnMappings(file.headers, file.providerType, file.fileType);
      });
      setColumnMappings(initialMappings);

      const orderFileIndex = allFiles.findIndex(file => file.fileType === FILE_TYPES.ORDER);
      setPrimaryFileIndex(orderFileIndex >= 0 ? orderFileIndex : 0);
      setStep(STEPS.MAPPING);
      showSuccess(`Successfully processed ${allFiles.length} file(s) with selected worksheets.`, 'Worksheets Processed');
    } catch (error) {
      console.error('Error processing worksheet selections:', error);
      showError('An error occurred while processing the worksheet selections. Please try again.');
    }
  }, [files, filesWithWorksheets, showSuccess, showError]);

  const handleContinueFromLinking = useCallback(() => {
    setStep(STEPS.RESULTS);
  }, []);

  const updateColumnMapping = useCallback((fileIndex, field, column) => {
    setColumnMappings(prev => ({
      ...prev,
      [fileIndex]: {
        ...prev[fileIndex],
        [field]: column === 'none' ? null : column
      }
    }));
  }, []);

  const exportMapping = useCallback(() => {
    if (!mappingName.trim()) {
      showWarning('Please enter a name for the mapping.');
      return;
    }

    try {
      const mappingData = {
        name: mappingName.trim(),
        timestamp: new Date().toISOString(),
        files: files.map(file => ({
          name: file.name,
          headers: file.headers,
          providerType: file.providerType,
          fileType: file.fileType
        })),
        columnMappings: columnMappings,
        primaryFileIndex: primaryFileIndex,
        version: '3.0'
      };

      const dataStr = JSON.stringify(mappingData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${mappingName.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase()}_mapping.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showSuccess(`Mapping "${mappingName}" has been saved successfully!`, 'Mapping Saved');
    } catch (error) {
      console.error('Error exporting mapping:', error);
      showError('An error occurred while saving the mapping. Please try again.');
    }
  }, [mappingName, files, columnMappings, primaryFileIndex, showSuccess, showError, showWarning]);

  const importMapping = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fileContent = await file.text();
      const mappingData = JSON.parse(fileContent);

      if (!mappingData.name || !mappingData.columnMappings) {
        throw new Error('Invalid mapping file format');
      }

      if (!files || files.length === 0) {
        showWarning('Please upload files first before importing a mapping.');
        return;
      }

      setMappingName(mappingData.name);
      setColumnMappings(mappingData.columnMappings);
      
      if (mappingData.primaryFileIndex !== undefined && mappingData.primaryFileIndex < files.length) {
        setPrimaryFileIndex(mappingData.primaryFileIndex);
      }

      showSuccess(`Mapping "${mappingData.name}" has been loaded successfully!`, 'Mapping Loaded');
      
    } catch (error) {
      console.error('Error importing mapping:', error);
      showError('Error loading mapping file. Please check that it is a valid mapping file.');
    }

    event.target.value = '';
  }, [files, showSuccess, showError, showWarning]);

  const toggleRecordSelection = useCallback((recordIndex) => {
    setSelectedRecords(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(recordIndex)) {
        newSelected.delete(recordIndex);
      } else {
        newSelected.add(recordIndex);
      }
      return newSelected;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const visibleSelectableIndices = filteredData
      .map(record => processedData.indexOf(record))
      .filter(index => index !== -1);

    const allVisibleSelected = visibleSelectableIndices.every(index => selectedRecords.has(index));
    
    setSelectedRecords(prev => {
      const newSelected = new Set(prev);
      if (allVisibleSelected) {
        visibleSelectableIndices.forEach(index => newSelected.delete(index));
      } else {
        visibleSelectableIndices.forEach(index => newSelected.add(index));
      }
      return newSelected;
    });
  }, [filteredData, processedData, selectedRecords]);

  const handleCellEdit = useCallback((recordIndex, field, value) => {
    setProcessedData(prev => {
      const updated = [...prev];
      updated[recordIndex] = { ...updated[recordIndex], [field]: value };
      return updated;
    });
  }, []);

  const handleCellClick = useCallback((recordIndex, field) => {
    setEditingCell({ recordIndex, field });
  }, []);

  const handleCellBlur = useCallback(() => {
    setEditingCell(null);
  }, []);

  const viewServiceDetails = useCallback((location) => {
    setSelectedLocation(location);
    setShowServiceModal(true);
  }, []);

  const closeServiceModal = useCallback(() => {
    setShowServiceModal(false);
    setSelectedLocation(null);
  }, []);

  // Standardization with Gemini AI API
  const standardizeWithGemini = async (companyName, address) => {
    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, address }),
      });

      if (!response.ok) throw new Error(`API call failed: ${response.status}`);
      const result = await response.json();

      if (result.success && result.data) {
        return {
          companyName: result.data["Company Name"] || companyName,
          address1: result.data["Address 1"] || '',
          address2: result.data["Address 2"] || '',
          city: result.data["City"] || '',
          state: result.data["State"] || '',
          zipCode: result.data["Zip Code"] || ''
        };
      } else {
        throw new Error('Invalid response from API');
      }
    } catch (error) {
      console.error('Error calling standardization API:', error);
      // Return original data if API fails
      return {
        companyName: companyName,
        address1: address,
        address2: '',
        city: '',
        state: '',
        zipCode: ''
      };
    }
  };

  const standardizeSelectedRecords = useCallback(async () => {
    if (selectedRecords.size === 0) {
      showWarning('Please select at least one record to standardize.');
      return;
    }
    
    setIsStandardizing(true);
    const selectedIndices = Array.from(selectedRecords);
    setStandardizationProgress({ current: 0, total: selectedIndices.length });
    
    try {
      const updatedData = [...processedData];
      
      const batchSize = 5;
      for (let i = 0; i < selectedIndices.length; i += batchSize) {
        const batch = selectedIndices.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (recordIndex) => {
          const record = updatedData[recordIndex];
          if (!record) return;

          // Construct address string for API call
          const addressParts = [record.address1, record.address2, record.city, record.state, record.zipCode].filter(Boolean);
          const addressString = addressParts.length > 0 ? addressParts.join(', ') : record.address1 || '';

          // Call Gemini API for standardization
          const standardized = await standardizeWithGemini(record.companyName, addressString);

          updatedData[recordIndex] = { 
            ...record, 
            ...standardized, 
            isStandardized: true,
            originalData: {
              companyName: record.companyName,
              address1: record.address1,
              address2: record.address2,
              city: record.city,
              state: record.state,
              zipCode: record.zipCode
            }
          };
        });

        await Promise.all(batchPromises);
        setStandardizationProgress({ current: Math.min(i + batchSize, selectedIndices.length), total: selectedIndices.length });
      }

      setProcessedData(updatedData);
      
      const recordCount = selectedIndices.length;
      showSuccess(
        recordCount === processedData.length 
          ? `Successfully standardized all ${recordCount} records using Gemini AI.`
          : `Successfully standardized ${recordCount} record${recordCount !== 1 ? 's' : ''} using Gemini AI.`,
        'AI Standardization Complete'
      );
      
    } catch (error) {
      console.error('Error standardizing records:', error);
      showError('An error occurred while standardizing the records. Please try again.');
    } finally {
      setIsStandardizing(false);
      setStandardizationProgress({ current: 0, total: 0 });
    }
  }, [selectedRecords, processedData, showWarning, showSuccess, showError]);

  const resetAll = useCallback(() => {
    setStep(STEPS.UPLOAD);
    setFiles([]);
    setFilesWithWorksheets([]);
    setProcessedData([]);
    setColumnMappings({});
    setSelectedRecords(new Set());
    setEditingCell(null);
    setPrimaryFileIndex(0);
    setShowMissingAddresses(true);
    setShowDuplicates(true);
    setIsStandardizing(false);
    setStandardizationProgress({ current: 0, total: 0 });
    setMappingName('');
    setShowServiceModal(false);
    setSelectedLocation(null);
    setLinkingResults({});
    showInfo('Application has been reset. You can now upload new files.', 'Reset Complete');
  }, [showInfo]);

  return {
    // State
    files,
    filesWithWorksheets,
    processedData,
    columnMappings,
    primaryFileIndex,
    showMissingAddresses,
    showDuplicates,
    selectedRecords,
    editingCell,
    step,
    isStandardizing,
    standardizationProgress,
    mappingName,
    showServiceModal,
    selectedLocation,
    notifications,
    linkingResults,
    
    // Actions
    handleFileUpload,
    handleWorksheetSelection,
    handleContinueFromWorksheetSelection,
    handleContinueFromLinking,
    updateColumnMapping,
    setPrimaryFileIndex,
    setShowMissingAddresses,
    setShowDuplicates,
    setMappingName,
    toggleRecordSelection,
    toggleSelectAll,
    handleCellEdit,
    handleCellClick,
    handleCellBlur,
    processFilesEnhanced,
    standardizeSelectedRecords,
    exportEnhancedData,
    resetAll,
    exportMapping,
    importMapping,
    viewServiceDetails,
    closeServiceModal,
    removeNotification,
    
    // Computed
    filteredData,
    selectedCount
  };
};

// ==================== MAIN COMPONENT ====================
const TelecomExtractor = () => {
  const {
    // State
    files,
    filesWithWorksheets,
    processedData,
    columnMappings,
    primaryFileIndex,
    showMissingAddresses,
    showDuplicates,
    selectedRecords,
    editingCell,
    step,
    isStandardizing,
    standardizationProgress,
    mappingName,
    showServiceModal,
    selectedLocation,
    notifications,
    linkingResults,
    
    // Actions
    handleFileUpload,
    handleWorksheetSelection,
    handleContinueFromWorksheetSelection,
    handleContinueFromLinking,
    updateColumnMapping,
    setPrimaryFileIndex,
    setShowMissingAddresses,
    setShowDuplicates,
    setMappingName,
    toggleRecordSelection,
    toggleSelectAll,
    handleCellEdit,
    handleCellClick,
    handleCellBlur,
    processFilesEnhanced,
    standardizeSelectedRecords,
    exportEnhancedData,
    resetAll,
    exportMapping,
    importMapping,
    viewServiceDetails,
    closeServiceModal,
    removeNotification,
    
    // Computed
    filteredData,
    selectedCount
  } = useTelecomExtractor();

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-6">
      <SnackbarContainer notifications={notifications} onRemove={removeNotification} />
      
      <div className="max-w-none mx-auto bg-white rounded-lg shadow-lg p-4 lg:p-6">
        <header className="mb-6">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-800 flex items-center gap-2">
            <BarChart3 className="text-blue-600" />
            ForgeOS - Telecom Data Extractor
          </h1>
          <p className="text-gray-600 mt-2">Extract and link customer data from order and commission files across multiple telecom providers</p>
        </header>

        <StepIndicator currentStep={step} />

        {isStandardizing && (
          <ProgressIndicator 
            current={standardizationProgress.current}
            total={standardizationProgress.total}
          />
        )}

        {step === STEPS.UPLOAD && (
          <FileUploadStep onFileUpload={handleFileUpload} />
        )}

        {step === STEPS.WORKSHEET_SELECTION && (
          <WorksheetSelectionStep
            filesWithWorksheets={filesWithWorksheets}
            onWorksheetSelection={handleWorksheetSelection}
            onContinue={handleContinueFromWorksheetSelection}
          />
        )}

        {step === STEPS.MAPPING && (
          <ColumnMappingStep
            files={files}
            columnMappings={columnMappings}
            primaryFileIndex={primaryFileIndex}
            mappingName={mappingName}
            onUpdateMapping={updateColumnMapping}
            onSetPrimaryFile={setPrimaryFileIndex}
            onProcessFiles={processFilesEnhanced}
            onSetMappingName={setMappingName}
            onExportMapping={exportMapping}
            onImportMapping={importMapping}
          />
        )}

        {step === STEPS.LINKING && (
          <LinkingStep
            linkingResults={linkingResults}
            onContinue={handleContinueFromLinking}
          />
        )}

        {step === STEPS.RESULTS && (
          <ResultsStep
            processedData={processedData}
            filteredData={filteredData}
            selectedRecords={selectedRecords}
            selectedCount={selectedCount}
            showMissingAddresses={showMissingAddresses}
            showDuplicates={showDuplicates}
            editingCell={editingCell}
            isStandardizing={isStandardizing}
            files={files}
            primaryFileIndex={primaryFileIndex}
            onToggleRecordSelection={toggleRecordSelection}
            onToggleSelectAll={toggleSelectAll}
            onCellEdit={handleCellEdit}
            onCellClick={handleCellClick}
            onCellBlur={handleCellBlur}
            onToggleMissingAddresses={() => setShowMissingAddresses(!showMissingAddresses)}
            onToggleDuplicates={() => setShowDuplicates(!showDuplicates)}
            onStandardizeSelected={standardizeSelectedRecords}
            onExport={exportEnhancedData}
            onReset={resetAll}
            onViewServiceDetails={viewServiceDetails}
          />
        )}
      </div>

      <ServiceDetailsModal
        isOpen={showServiceModal}
        location={selectedLocation}
        onClose={closeServiceModal}
      />
    </div>
  );
};

export default TelecomExtractor;