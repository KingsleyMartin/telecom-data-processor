"use client";

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Upload, Download, FileText, Users, MapPin, AlertCircle, CheckCircle, X, ArrowRight, Package, Phone, Wifi, DollarSign, Calendar, Search, ChevronLeft, Settings, Check, Hash, Globe, Zap, Plus, AlertTriangle, Eye, Merge, Trash2, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';

// ===== CUSTOM HOOKS =====

// File parsing hook
const useFileParser = () => {
  const parseCSV = useCallback((content, fullParse = false) => {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { data: [], headers: [] };
    
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const data = [];
    const maxRows = fullParse ? lines.length : Math.min(lines.length, 11);
    
    for (let i = 1; i < maxRows; i++) {
      const values = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < lines[i].length; j++) {
        const char = lines[i][j];
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
      
      if (values.length === headers.length) {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        data.push(row);
      }
    }
    
    return { data, headers };
  }, []);

  const parseExcel = useCallback(async (file, fullParse = false) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, {
        type: 'array',
        cellDates: true,
        cellNF: true,
        cellStyles: true
      });
      
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        defval: '',
        raw: false
      });
      
      if (jsonData.length === 0) return { data: [], headers: [] };
      
      const headers = jsonData[0].map(h => String(h || '').trim()).filter(h => h);
      if (headers.length === 0) return { data: [], headers: [] };
      
      const maxRows = fullParse ? jsonData.length : Math.min(jsonData.length, 11);
      const data = [];
      
      for (let i = 1; i < maxRows; i++) {
        const row = {};
        const rowData = jsonData[i] || [];
        
        headers.forEach((header, index) => {
          let cellValue = rowData[index];
          
          if (cellValue === null || cellValue === undefined) {
            cellValue = '';
          } else if (typeof cellValue === 'number') {
            cellValue = cellValue.toString();
          } else if (cellValue instanceof Date) {
            cellValue = cellValue.toISOString().split('T')[0];
          } else {
            cellValue = String(cellValue).trim();
          }
          
          row[header] = cellValue;
        });
        
        if (Object.values(row).some(val => val !== '')) {
          data.push(row);
        }
      }
      
      return { data, headers };
    } catch (error) {
      console.error('Excel parsing error:', error);
      throw new Error(`Failed to parse Excel file: ${error.message}`);
    }
  }, []);

  const parseFile = useCallback(async (file, fullParse = false) => {
    const fileName = file.name.toLowerCase();
    const fileType = file.type;
    
    if (fileType === 'text/csv' || fileName.endsWith('.csv')) {
      const content = await file.text();
      return parseCSV(content, fullParse);
    } else if (
      fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      fileType === 'application/vnd.ms-excel' ||
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls')
    ) {
      return await parseExcel(file, fullParse);
    } else {
      throw new Error('Unsupported file type. Please upload a CSV or Excel file.');
    }
  }, [parseCSV, parseExcel]);

  return { parseFile };
};

// Duplicate detection hook
const useDuplicateDetection = () => {
  const normalizeForDuplicateDetection = useCallback((text) => {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\b(inc|llc|corp|corporation|company|co|ltd|limited)\b/g, '')
      .trim();
  }, []);

  const levenshteinDistance = useCallback((str1, str2) => {
    const matrix = Array(str2.length + 1).fill().map(() => Array(str1.length + 1).fill(0));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j - 1][i] + 1,
          matrix[j][i - 1] + 1,
          matrix[j - 1][i - 1] + cost
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }, []);

  const calculateSimilarity = useCallback((str1, str2) => {
    if (!str1 || !str2) return 0;
    const normalized1 = normalizeForDuplicateDetection(str1);
    const normalized2 = normalizeForDuplicateDetection(str2);
    
    if (normalized1 === normalized2) return 1;
    
    const maxLength = Math.max(normalized1.length, normalized2.length);
    if (maxLength === 0) return 1;
    
    const distance = levenshteinDistance(normalized1, normalized2);
    return 1 - (distance / maxLength);
  }, [normalizeForDuplicateDetection, levenshteinDistance]);

  const detectDuplicates = useCallback((data, keyField, threshold = 0.8) => {
    const duplicateGroups = [];
    const processed = new Set();
    
    for (let i = 0; i < data.length; i++) {
      if (processed.has(i)) continue;
      
      const currentItem = data[i];
      const currentKey = currentItem[keyField];
      const currentAddress = currentItem['Address 1'];
      
      if (!currentKey || !currentAddress) continue;
      
      const similarItems = [{ index: i, item: currentItem, similarity: 1 }];
      
      for (let j = i + 1; j < data.length; j++) {
        if (processed.has(j)) continue;
        
        const compareItem = data[j];
        const compareKey = compareItem[keyField];
        const compareAddress = compareItem['Address 1'];
        
        if (!compareKey || !compareAddress) continue;
        
        const nameSimilarity = calculateSimilarity(currentKey, compareKey);
        const addressSimilarity = calculateSimilarity(currentAddress, compareAddress);
        
        const NAME_THRESHOLD = threshold;
        const ADDRESS_THRESHOLD = threshold * 0.875; // Slightly lower threshold for address
        
        if (nameSimilarity >= NAME_THRESHOLD && addressSimilarity >= ADDRESS_THRESHOLD) {
          const combinedSimilarity = (nameSimilarity * 0.6) + (addressSimilarity * 0.4);
          
          similarItems.push({ 
            index: j, 
            item: compareItem, 
            similarity: combinedSimilarity,
            details: {
              nameSimilarity: Math.round(nameSimilarity * 100),
              addressSimilarity: Math.round(addressSimilarity * 100)
            }
          });
          processed.add(j);
        }
      }
      
      if (similarItems.length > 1) {
        duplicateGroups.push({
          id: `group_${duplicateGroups.length + 1}`,
          items: similarItems.sort((a, b) => b.similarity - a.similarity),
          type: keyField,
          resolved: false
        });
      }
      
      processed.add(i);
    }
    
    return duplicateGroups;
  }, [calculateSimilarity]);

  return { detectDuplicates };
};

// Field mapping hook
const useFieldMapping = () => {
  const initialMappings = [
    { id: 'customer', label: 'CUSTOMER', ordersField: 'customerField', commissionsField: 'customerField', required: true, icon: 'users' },
    { id: 'address', label: 'ADDRESS', ordersField: 'locationField', commissionsField: 'addressField', required: false, icon: 'map-pin' },
    { id: 'service', label: 'SERVICE', ordersField: 'productField', commissionsField: 'serviceField', required: true, icon: 'package' },
    { id: 'provider', label: 'PROVIDER', ordersField: 'providerField', commissionsField: 'providerField', required: false, icon: 'globe' },
    { id: 'account', label: 'ACCOUNT', ordersField: 'accountField', commissionsField: 'accountField', required: false, icon: 'hash' }
  ];

  const [dynamicMappings, setDynamicMappings] = useState(initialMappings);
  const [nextMappingId, setNextMappingId] = useState(6);

  const [fieldMapping, setFieldMapping] = useState({
    orders: {
      customerField: '',
      locationField: '',
      accountField: '',
      orderIdField: '',
      providerField: '',
      productField: ''
    },
    commissions: {
      customerField: '',
      providerCustomerField: '',
      addressField: '',
      accountField: '',
      orderIdField: '',
      providerField: '',
      serviceField: '',
      amountField: ''
    }
  });

  const autoDetectFieldMappings = useCallback((headers, fileType) => {
    const findField = (patterns) => {
      return headers.find(header => 
        patterns.some(pattern => 
          header.toLowerCase().includes(pattern.toLowerCase())
        )
      ) || '';
    };

    const detectedMapping = {};

    if (fileType === 'orders') {
      detectedMapping.customerField = findField(['customer', 'client', 'company']);
      detectedMapping.locationField = findField(['location', 'address', 'site']);
      detectedMapping.accountField = findField(['account', 'billing account', 'account number']);
      detectedMapping.orderIdField = findField(['order id', 'order', 'order number']);
      detectedMapping.providerField = findField(['provider', 'supplier', 'vendor']);
      detectedMapping.productField = findField(['product', 'service', 'description']);
    } else {
      detectedMapping.customerField = findField(['customer', 'client', 'company']);
      detectedMapping.providerCustomerField = findField(['provider customer', 'account name', 'billing name']);
      detectedMapping.addressField = findField(['address', 'site address', 'location']);
      detectedMapping.accountField = findField(['account', 'account number', 'billing account']);
      detectedMapping.orderIdField = findField(['order id', 'order', 'order number']);
      detectedMapping.providerField = findField(['provider', 'supplier', 'vendor']);
      detectedMapping.serviceField = findField(['service', 'product', 'description']);
      detectedMapping.amountField = findField(['amount', 'net billed', 'revenue', 'commission']);
    }

    setFieldMapping(prev => ({
      ...prev,
      [fileType]: { ...prev[fileType], ...detectedMapping }
    }));
  }, []);

  const addFieldMapping = useCallback(() => {
    const newMapping = {
      id: `custom_${nextMappingId}`,
      label: `CUSTOM ${nextMappingId}`,
      ordersField: `customField${nextMappingId}Orders`,
      commissionsField: `customField${nextMappingId}Commissions`,
      required: false,
      icon: 'zap'
    };
    
    setDynamicMappings(prev => [...prev, newMapping]);
    setNextMappingId(prev => prev + 1);
    
    setFieldMapping(prev => ({
      orders: { ...prev.orders, [newMapping.ordersField]: '' },
      commissions: { ...prev.commissions, [newMapping.commissionsField]: '' }
    }));
  }, [nextMappingId]);

  const removeFieldMapping = useCallback((mappingId) => {
    const mappingToRemove = dynamicMappings.find(m => m.id === mappingId);
    if (!mappingToRemove || mappingToRemove.required) return;
    
    setDynamicMappings(prev => prev.filter(m => m.id !== mappingId));
    
    setFieldMapping(prev => {
      const newOrders = { ...prev.orders };
      const newCommissions = { ...prev.commissions };
      delete newOrders[mappingToRemove.ordersField];
      delete newCommissions[mappingToRemove.commissionsField];
      return {
        orders: newOrders,
        commissions: newCommissions
      };
    });
  }, [dynamicMappings]);

  const updateMappingLabel = useCallback((mappingId, newLabel) => {
    setDynamicMappings(prev => 
      prev.map(mapping => 
        mapping.id === mappingId 
          ? { ...mapping, label: newLabel.toUpperCase() }
          : mapping
      )
    );
  }, []);

  const resetMappings = useCallback(() => {
    setDynamicMappings(initialMappings);
    setNextMappingId(6);
    setFieldMapping({
      orders: {
        customerField: '',
        locationField: '',
        accountField: '',
        orderIdField: '',
        providerField: '',
        productField: ''
      },
      commissions: {
        customerField: '',
        providerCustomerField: '',
        addressField: '',
        accountField: '',
        orderIdField: '',
        providerField: '',
        serviceField: '',
        amountField: ''
      }
    });
  }, []);

  return {
    dynamicMappings,
    fieldMapping,
    setFieldMapping,
    autoDetectFieldMappings,
    addFieldMapping,
    removeFieldMapping,
    updateMappingLabel,
    resetMappings
  };
};

// ===== UTILITY FUNCTIONS =====

const cleanText = (text) => {
  if (!text || text === null || text === undefined) return '';
  return String(text).trim();
};

const arrayToCSV = (data) => {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [];
  
  csvRows.push(headers.map(header => `"${header}"`).join(','));
  
  data.forEach(row => {
    const values = headers.map(header => {
      const value = row[header] || '';
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  });
  
  return csvRows.join('\n');
};

const downloadCSV = (data, filename) => {
  const csvContent = arrayToCSV(data);
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { 
    type: 'text/csv;charset=utf-8;' 
  });
  
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  window.URL.revokeObjectURL(url);
};

// ===== COMPONENTS =====

const FileUploadCard = ({ title, description, file, onFileUpload, headers, previewData, fullData, processing }) => (
  <div className="bg-white rounded-lg shadow-sm border p-6">
    <h2 className="text-2xl font-semibold text-gray-800 mb-4">{title}</h2>
    <p className="text-gray-600 mb-6">{description}</p>
    
    <div className="max-w-md mx-auto mb-6">
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-blue-400 transition-colors">
        <div className="text-center">
          <Upload className="mx-auto h-16 w-16 text-gray-400 mb-4" />
          <label className="cursor-pointer">
            <span className="text-xl font-medium text-gray-700">Upload File</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              onChange={onFileUpload}
              className="hidden"
            />
          </label>
          <p className="text-sm text-gray-500 mt-2">CSV or Excel format (.csv, .xlsx, .xls)</p>
          {file && (
            <div className="mt-4 flex items-center justify-center text-green-600">
              <CheckCircle className="h-5 w-5 mr-2" />
              <span className="text-sm">{file.name}</span>
            </div>
          )}
        </div>
      </div>
    </div>

    {headers.length > 0 && (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">Detected Fields ({headers.length})</h4>
        <div className="max-h-32 overflow-y-auto">
          <div className="grid grid-cols-3 gap-2 text-sm text-blue-700">
            {headers.map((header, index) => (
              <div key={index} className="truncate">{header}</div>
            ))}
          </div>
        </div>
        <p className="text-sm text-blue-600 mt-2">
          Preview: {previewData.length} rows shown | Total: {fullData.length} rows loaded for processing
        </p>
      </div>
    )}
  </div>
);

const ProgressSteps = ({ currentStep }) => (
  <div className="mb-8 flex items-center justify-center">
    <div className="flex items-center space-x-4">
      <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${currentStep >= 1 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'}`}>
        <Users className="w-5 h-5" />
        <span className="font-medium">1. Extract Companies</span>
      </div>
      <ArrowRight className="w-5 h-5 text-gray-400" />
      <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${currentStep >= 2 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'}`}>
        <Settings className="w-5 h-5" />
        <span className="font-medium">2. Configure Fields</span>
      </div>
      <ArrowRight className="w-5 h-5 text-gray-400" />
      <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${currentStep >= 3 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
        <Download className="w-5 h-5" />
        <span className="font-medium">3. Export Results</span>
      </div>
    </div>
  </div>
);

const ErrorAlert = ({ error }) => error && (
  <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
    <div className="flex items-center">
      <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
      <span className="text-red-700">{error}</span>
    </div>
  </div>
);

const DuplicateNotification = ({ duplicateCount, onShowDuplicates }) => duplicateCount > 0 && (
  <div className="mb-6 bg-orange-50 border border-orange-200 rounded-lg p-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center">
        <AlertTriangle className="h-5 w-5 text-orange-500 mr-3" />
        <div>
          <span className="text-orange-700 font-medium">
            Potential duplicates detected: {duplicateCount} groups need review
          </span>
          <p className="text-orange-600 text-sm mt-1">
            Review and resolve duplicates to ensure data quality
          </p>
        </div>
      </div>
      <button
        onClick={() => onShowDuplicates(true)} // Simplified to always set true
        className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-800 rounded-lg hover:bg-orange-200 transition-colors"
      >
        <Eye className="w-4 h-4" />
        Review Duplicates
      </button>
    </div>
  </div>
);

const MappingIcon = ({ iconType }) => {
  switch (iconType) {
    case 'users': return <Users className="w-3 h-3" />;
    case 'map-pin': return <MapPin className="w-3 h-3" />;
    case 'package': return <Package className="w-3 h-3" />;
    case 'globe': return <Globe className="w-3 h-3" />;
    case 'hash': return <Hash className="w-3 h-3" />;
    case 'zap': return <Zap className="w-3 h-3" />;
    default: return <Zap className="w-3 h-3" />;
  }
};

const DuplicateGroup = ({ group, onResolve, type }) => {
  const [selectedIndex, setSelectedIndex] = useState(0); // Default to first item
  const [isResolved, setIsResolved] = useState(group.resolved || false);

  const handleResolve = () => {
    const selectedItem = group.items[selectedIndex];
    const otherItems = group.items.filter((_, index) => index !== selectedIndex);
    
    onResolve(group.id, selectedItem, otherItems);
    setIsResolved(true);
  };

  const handleSelectItem = (index) => {
    if (!isResolved) {
      setSelectedIndex(index);
    }
  };

  return (
    <div className={`border rounded-lg p-4 ${
      isResolved ? 'bg-green-50 border-green-200' : 
      group.items.some(item => item.item.isFromSecondary) ? 'bg-orange-50 border-orange-200' :
      'bg-red-50 border-red-200'
    }`}>
      {group.items.some(item => item.item.isFromSecondary) && (
        <div className="mb-3 p-2 bg-orange-100 border border-orange-200 rounded text-sm text-orange-800">
          <strong>Note:</strong> This group contains records from the secondary file
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-gray-900">
          Duplicate Group {group.id} - {group.items.length} similar records
        </h4>
        {isResolved ? (
          <span className="flex items-center gap-1 text-green-700 text-sm">
            <CheckCircle className="w-4 h-4" />
            Resolved
          </span>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleResolve}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              <Check className="w-3 h-3" />
              Keep Selected
            </button>
          </div>
        )}
      </div>
      
      {!isResolved && (
        <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
          <strong>Instructions:</strong> Click on a record to select it as the one to keep. The selected record will be preserved, and duplicates will be marked for removal from the export.
        </div>
      )}

      <div className="space-y-2">
        {group.items.map((item, index) => (
          <div 
            key={index} 
            className={`flex items-center justify-between p-3 rounded border cursor-pointer transition-colors ${
              isResolved 
                ? selectedIndex === index 
                  ? 'bg-green-100 border-green-300' 
                  : 'bg-gray-100 border-gray-300 opacity-60'
                : selectedIndex === index
                  ? 'bg-blue-100 border-blue-300'
                  : 'bg-white border-gray-200 hover:bg-gray-50'
            }`}
            onClick={() => handleSelectItem(index)}
          >
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                selectedIndex === index 
                  ? isResolved 
                    ? 'border-green-500 bg-green-500' 
                    : 'border-blue-500 bg-blue-500'
                  : 'border-gray-300'
              }`}>
                {selectedIndex === index && (
                  <Check className="w-2.5 h-2.5 text-white" />
                )}
              </div>
              <div>
                <p className="font-medium">{item.item.Customer}</p>
                <p className="text-sm text-gray-600">{item.item['Address 1']}</p>
                <p className="text-sm text-gray-500">{item.item.City}, {item.item.State}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-medium text-blue-600">
                {Math.round(item.similarity * 100)}% match
              </span>
              {isResolved && selectedIndex !== index && (
                <div className="text-xs text-red-600 mt-1">
                  <Trash2 className="w-3 h-3 inline mr-1" />
                  Marked for removal
                </div>
              )}
              {isResolved && selectedIndex === index && (
                <div className="text-xs text-green-600 mt-1">
                  <CheckCircle className="w-3 h-3 inline mr-1" />
                  Preserved
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DuplicateDetectionPanel = ({ 
  duplicates, 
  showDuplicates, 
  onCloseDuplicates, 
  onResolveDuplicate,
  duplicateThreshold,
  onThresholdChange,
  extractedData,
  onReanalyzeDuplicates 
}) => {
  const totalGroups = duplicates.customers.length + duplicates.locations.length;

  // Debug logs
  console.log('DuplicateDetectionPanel rendered:', {
    showDuplicates,
    totalGroups,
    duplicates
  });

  if (!showDuplicates) return null;

  return (
    <div className="mb-6 bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-800">Duplicate Detection & Resolution</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Similarity Threshold:</label>
            <select
              value={duplicateThreshold}
              onChange={(e) => {
                const newThreshold = parseFloat(e.target.value);
                onThresholdChange(newThreshold);
                // Re-analyze duplicates with new threshold
                if (extractedData.customers.length > 0) {
                  onReanalyzeDuplicates(extractedData.customers, extractedData.locations);
                }
              }}
              className="px-3 py-1 text-sm border border-gray-300 rounded"
            >
              <option value={0.7}>70% - Loose matching</option>
              <option value={0.8}>80% - Balanced</option>
              <option value={0.9}>90% - Strict matching</option>
              <option value={0.95}>95% - Very strict</option>
            </select>
          </div>
          <button
            onClick={onCloseDuplicates}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {totalGroups === 0 ? (
        <div className="text-center py-8">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Duplicates Found</h3>
          <p className="text-gray-600">All company and location records appear to be unique at the current similarity threshold.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Customer Duplicates */}
          {duplicates.customers.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Customer Duplicates ({duplicates.customers.length} groups)</h3>
              <div className="space-y-4">
                {duplicates.customers.map((group) => (
                  <DuplicateGroup 
                    key={group.id} 
                    group={group} 
                    onResolve={onResolveDuplicate}
                    type="customer"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Location Duplicates */}
          {duplicates.locations.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Location Duplicates ({duplicates.locations.length} groups)</h3>
              <div className="space-y-4">
                {duplicates.locations.map((group) => (
                  <DuplicateGroup 
                    key={group.id} 
                    group={group} 
                    onResolve={onResolveDuplicate}
                    type="location"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const DataPreviewPanel = ({ extractedData, onUpdateData, onSecondarySelectionChange }) => {
  const [activeTab, setActiveTab] = useState('customers');
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState([]);
  const [selectedSecondaryRecords, setSelectedSecondaryRecords] = useState(new Set());

  // Move isFieldEmpty function definition to the top
  const isFieldEmpty = (value) => {
    if (value === null || value === undefined) return true;
    return String(value).trim() === '';
  };

  const currentData = activeTab === 'customers' ? extractedData.customers : extractedData.locations;
  
  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!searchTerm) return currentData;
    return currentData.filter(item => 
      Object.values(item).some(value => 
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [currentData, searchTerm]);

  // Count missing fields
  const missingFieldsCount = useMemo(() => {
    return currentData.reduce((total, item) => {
      return total + Object.values(item).filter(value => isFieldEmpty(value)).length;
    }, 0);
  }, [currentData]);

  const handleCellClick = (rowIndex, field, currentValue) => {
    setEditingCell(`${rowIndex}-${field}`);
    setEditValue(currentValue || '');
  };

  const handleCellSave = (rowIndex, field) => {
    const updatedData = { ...extractedData };
    const dataArray = activeTab === 'customers' ? updatedData.customers : updatedData.locations;
    
    // Find the actual index in the full dataset
    const actualIndex = extractedData[activeTab === 'customers' ? 'customers' : 'locations']
      .findIndex(item => JSON.stringify(item) === JSON.stringify(filteredData[rowIndex]));
    
    if (actualIndex !== -1) {
      dataArray[actualIndex] = {
        ...dataArray[actualIndex],
        [field]: editValue
      };
      onUpdateData(updatedData);
    }
    
    setEditingCell(null);
    setEditValue('');
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const handleKeyPress = (e, rowIndex, field) => {
    if (e.key === 'Enter') {
      handleCellSave(rowIndex, field);
    } else if (e.key === 'Escape') {
      handleCellCancel();
    }
  };

  const getFieldHeaders = () => {
    if (activeTab === 'customers') {
      return ['Customer', 'Address 1', 'Address 2', 'City', 'State', 'URL (Google)'];
    } else {
      return ['Customer', 'Address 1', 'Address 2', 'City', 'State', 'Country (Google)'];
    }
  };

  // FIXED: Proper handling of shift-click to remove columns
  const handleHeaderClick = (column, event) => {
    setSortConfig(prevSort => {
      if (event.shiftKey) {
        // Multi-column sort while preserving existing order
        const existingIndex = prevSort.findIndex(s => s.column === column);
        
        if (existingIndex === -1) {
          // Add new column as additional sort
          return [...prevSort, { column, direction: 'asc' }];
        } else {
          const current = prevSort[existingIndex].direction;
          if (current === 'asc') {
            // Second shift-click: toggle to desc
            return prevSort.map((sort, index) => 
              index === existingIndex 
                ? { ...sort, direction: 'desc' }
                : sort
            );
          } else {
            // Third shift-click: remove from sort
            return prevSort.filter(s => s.column !== column);
          }
        }
      } else {
        // Single column sort - replace all existing sorts
        return [{ column, direction: 'asc' }];
      }
    });
  };

  // FIXED: Correct multi-column sorting implementation
  const sortedData = useMemo(() => {
    if (!sortConfig.length) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      // Walk through sort config in order (first column = highest priority)
      for (const { column, direction } of sortConfig) {
        const valueA = String(a[column] || '');
        const valueB = String(b[column] || '');
        
        const cmp = valueA.localeCompare(valueB, undefined, { numeric: true });
        
        if (cmp !== 0) {
          return direction === 'asc' ? cmp : -cmp;
        }
        // If values are equal, continue to next sort column
      }
      return 0; // All sort columns are equal
    });
  }, [filteredData, sortConfig]);

  // Add handler for checkbox changes
  const handleSecondaryRecordToggle = (rowIndex, item) => {
    const key = `${item.Customer}_${item['Address 1']}`;
    setSelectedSecondaryRecords(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  useEffect(() => {
    onSecondarySelectionChange?.(selectedSecondaryRecords);
  }, [selectedSecondaryRecords, onSecondarySelectionChange]);

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800">Data Preview & Editing</h2>
          <p className="text-gray-600">Review extracted data and fill in any missing information</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">
            {missingFieldsCount} missing fields detected
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search records..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => {
              setActiveTab('customers');
              setSearchTerm('');
            }}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'customers'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Customers ({extractedData.customers.length})
            </div>
          </button>
          <button
            onClick={() => {
              setActiveTab('locations');
              setSearchTerm('');
            }}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'locations'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Locations ({extractedData.locations.length})
            </div>
          </button>
        </nav>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {/* Add checkbox column if there are secondary records */}
              {currentData.some(i => i.isFromSecondary) && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Export
                </th>
              )}
              {getFieldHeaders().map((header) => (
                <th
                  key={header}
                  onClick={(e) => handleHeaderClick(header, e)}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100"
                >
                  <div className="flex items-center gap-1">
                    {header}
                    {sortConfig.map((sort, index) => 
                      sort.column === header ? (
                        <span key={index} className="inline-flex items-center">
                          {sort.direction === 'asc' ? '↑' : '↓'}
                          <span className="text-xs text-blue-600 ml-0.5">
                            {index + 1}
                          </span>
                        </span>
                      ) : null
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedData.map((item, rowIndex) => (
              <tr key={rowIndex} className={`hover:bg-gray-50 ${item.isFromSecondary ? 'bg-yellow-50' : ''}`}>
                {/* Add checkbox column if there are secondary records */}
                {currentData.some(i => i.isFromSecondary) && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    {item.isFromSecondary && (
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selectedSecondaryRecords.has(`${item.Customer}_${item['Address 1']}`)}
                          onChange={() => handleSecondaryRecordToggle(rowIndex, item)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </div>
                    )}
                  </td>
                )}
                {getFieldHeaders().map((field) => {
                  const cellKey = `${rowIndex}-${field}`;
                  const isEditing = editingCell === cellKey;
                  const value = item[field];
                  const isEmpty = isFieldEmpty(value);
                  
                  return (
                    <td
                      key={field}
                      className={`px-6 py-4 whitespace-nowrap text-sm ${
                        isEmpty ? 'bg-red-50 border border-red-200' : 
                        item.isFromSecondary ? 'bg-yellow-50' : ''
                      }`}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleCellSave(rowIndex, field)}
                          onKeyDown={(e) => handleKeyPress(e, rowIndex, field)}
                          className="w-full px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          autoFocus
                        />
                      ) : (
                        <div
                          onClick={() => handleCellClick(rowIndex, field, value)}
                          className={`cursor-pointer min-h-[24px] px-2 py-1 rounded hover:bg-gray-100 ${
                            isEmpty ? 'text-red-500 italic' : 'text-gray-900'
                          }`}
                        >
                          {isEmpty ? 'Click to add...' : String(value)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredData.length === 0 && searchTerm && (
        <div className="text-center py-8">
          <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
          <p className="text-gray-600">Try adjusting your search terms.</p>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">Editing & Sorting Instructions</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Click on any cell to edit its value</li>
          <li>• Empty fields are highlighted in red</li>
          <li>• Records from secondary files are highlighted in yellow</li>
          <li>• Press Enter to save or Escape to cancel</li>
          <li>• Click column headers to sort (↑ ascending, ↓ descending)</li>
          <li>• Hold Shift + click headers for multi-column sorting (click again to remove)</li>
          <li>• Use the search bar to find specific records</li>
        </ul>
      </div>
    </div>
  );
};

// ===== MAIN COMPONENT =====

const WorkflowApp = () => {
  // File parsing hook
  const { parseFile } = useFileParser();
  
  // Duplicate detection hook
  const { detectDuplicates } = useDuplicateDetection();
  
  // Field mapping hook
  const {
    dynamicMappings,
    fieldMapping,
    setFieldMapping,
    autoDetectFieldMappings,
    addFieldMapping,
    removeFieldMapping,
    updateMappingLabel,
    resetMappings
  } = useFieldMapping();

  // Main state
  const [currentStep, setCurrentStep] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  
  // File states
  const [orderFile, setOrderFile] = useState(null);
  const [serviceFile, setServiceFile] = useState(null);
  const [secondaryFile, setSecondaryFile] = useState(null);
  const [ordersData, setOrdersData] = useState({ headers: [], data: [] });
  const [commissionsData, setCommissionsData] = useState({ headers: [], data: [] });
  const [secondaryData, setSecondaryData] = useState({ headers: [], data: [] });
  const [fullOrdersData, setFullOrdersData] = useState({ headers: [], data: [] });
  const [fullCommissionsData, setFullCommissionsData] = useState({ headers: [], data: [] });
  const [fullSecondaryData, setFullSecondaryData] = useState({ headers: [], data: [] });
  
  // Results states
  const [extractedData, setExtractedData] = useState({ customers: [], locations: [] });
  const [enrichedData, setEnrichedData] = useState({ matches: [], unmatched: [] });
  
  // UI states
  const [duplicates, setDuplicates] = useState({ customers: [], locations: [] });
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [resolvedDuplicates, setResolvedDuplicates] = useState(new Map()); // Map of groupId -> {selected: item, removed: [items]}
  const [duplicateThreshold, setDuplicateThreshold] = useState(0.8);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [exportFields, setExportFields] = useState({ orders: [], commissions: [] });
  const [showExportConfig, setShowExportConfig] = useState(false);

  // Get filtered data excluding resolved duplicates
  const getFilteredDataForExport = useCallback((data) => {
    const removedItems = new Set();
    
    // Collect all items marked for removal from duplicates
    resolvedDuplicates.forEach(({ removed }) => {
      removed.forEach(item => {
        const key = `${item.item.Customer}_${item.item['Address 1']}`;
        removedItems.add(key);
      });
    });
    
    // Filter out removed items and respect includeInExport flag
    return data.filter(item => {
      const key = `${item.customer || item.Customer}_${item.address || item['Address 1']}`;
      const shouldInclude = !removedItems.has(key);
      
      // If it's a secondary record, check includeInExport flag
      if (item.isFromSecondary) {
        return shouldInclude && item.includeInExport;
      }
      
      return shouldInclude;
    });
  }, [resolvedDuplicates]);

  // Memoized calculations
  const totalDuplicateGroups = useMemo(() => {
    return duplicates.customers.length + duplicates.locations.length;
  }, [duplicates]);

  const unresolvedDuplicateGroups = useMemo(() => {
    const unresolvedCustomers = duplicates.customers.filter(group => !group.resolved);
    const unresolvedLocations = duplicates.locations.filter(group => !group.resolved);
    return unresolvedCustomers.length + unresolvedLocations.length;
  }, [duplicates]);

  const filteredData = useMemo(() => {
    // First filter by match status
    let dataToFilter = selectedFilter === 'matched' ? enrichedData.matches : 
                      selectedFilter === 'unmatched' ? enrichedData.unmatched.map(item => ({...item, services: []})) :
                      [...enrichedData.matches, ...enrichedData.unmatched.map(item => ({...item, services: []}))];
    
    // Apply duplicate resolution filtering
    dataToFilter = getFilteredDataForExport(dataToFilter);
    
    // Apply search filtering
    if (searchTerm) {
      dataToFilter = dataToFilter.filter(item =>
        item.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.services && item.services.some(service => 
          service.product?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          service.provider?.toLowerCase().includes(searchTerm.toLowerCase())
        ))
      );
    }
    
    return dataToFilter;
  }, [enrichedData, selectedFilter, searchTerm, getFilteredDataForExport]);

  // Extract company data from parsed CSV with optional secondary data merging
  const extractCompanyData = useCallback((parsedData, secondaryParsedData = null) => {
    const customers = new Map();
    const locations = new Map();
    
    const processData = (data, isSecondary = false) => {
      data.forEach(row => {
        let customerName = '';
        if (row['Customer']) customerName = cleanText(row['Customer']);
        else if (row['Customer Name']) customerName = cleanText(row['Customer Name']);
        
        if (!customerName) return;
        
        let address1 = '';
        let address2 = '';
        let city = '';
        let state = '';
        
        if (row['Location']) {
          address1 = cleanText(row['Location']);
        } else if (row['Address']) {
          address1 = cleanText(row['Address']);
          address2 = cleanText(row['Address Line 2'] || row['Address 2']);
        } else if (row['Street Address']) {
          address1 = cleanText(row['Street Address']);
          const suite = cleanText(row['Suite/Unit/Floor/Apt'] || row['Suite']);
          if (suite) address1 += ', ' + suite;
        } else if (row['Location Address']) {
          address1 = cleanText(row['Location Address']);
        }
        
        city = cleanText(row['City'] || '');
        state = cleanText(row['State'] || '');
        
        if (!city && !state && row['Location City State Zip']) {
          const cityStateZip = cleanText(row['Location City State Zip']);
          const parts = cityStateZip.split(' ');
          if (parts.length >= 3) {
            state = parts[parts.length - 2];
            city = parts.slice(0, -2).join(' ');
          }
        }
        
        if (customerName && address1) {
          const customerKey = customerName.toUpperCase();
          
          if (!customers.has(customerKey)) {
            customers.set(customerKey, {
              Customer: customerName,
              'Address 1': address1,
              'URL (Google)': '',
              'Address 2': address2,
              City: city,
              State: state,
              isFromSecondary: isSecondary
            });
          }
          
          const locationKey = `${customerKey}_${address1.toUpperCase()}`;
          if (!locations.has(locationKey)) {
            locations.set(locationKey, {
              Customer: customerName,
              'Address 1': address1,
              'Address 2': address2,
              City: city,
              State: state,
              'Country (Google)': '',
              isFromSecondary: isSecondary
            });
          }
        }
      });
    };
    
    // Process primary data first
    processData(parsedData.data, false);
    
    // Process secondary data if provided
    if (secondaryParsedData && secondaryParsedData.data) {
      processData(secondaryParsedData.data, true);
    }
    
    return {
      customers: Array.from(customers.values()),
      locations: Array.from(locations.values())
    };
  }, []);

  // Enrich locations with service data
  const enrichWithServices = useCallback((locations, serviceData) => {
    const normalizeCompanyName = (name) => {
      if (!name) return '';
      return name.toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim();
    };

    const customerCol = fieldMapping.commissions.customerField || 'Customer';
    const productCol = fieldMapping.commissions.serviceField || 'Product';
    const providerCol = fieldMapping.commissions.providerField || 'Provider';

    const locationCustomers = locations.map(loc => {
      const address1 = loc['Address 1'] || '';
      const address2 = loc['Address 2'] || '';
      const city = loc.City || '';
      const state = loc.State || '';
      
      return {
        original: loc.Customer,
        normalized: normalizeCompanyName(loc.Customer),
        fullAddress: `${address1}${address2 ? ', ' + address2 : ''}, ${city}, ${state}`,
        city: city,
        state: state,
        ...loc
      };
    });

    const commissionCustomers = serviceData.data.map(comm => ({
      original: comm[customerCol] || comm.Customer,
      normalized: normalizeCompanyName(comm[customerCol] || comm.Customer),
      product: comm[productCol] || comm.Product,
      provider: comm[providerCol] || comm.Provider,
      qty: comm.Qty || comm.Quantity,
      netBilled: comm['Net Billed'] || comm.Amount,
      installDate: comm['Install Date'] || comm['Start Date'],
      invoiceDate: comm['Invoice Date'] || comm.Date,
      agentComm: comm['Agent comm.'] || comm.Commission,
      ...comm
    }));

    const matches = [];
    const unmatched = [];

    locationCustomers.forEach(locCustomer => {
      const matchingCommissions = commissionCustomers.filter(commCustomer => 
        commCustomer.normalized === locCustomer.normalized
      );
      
      if (matchingCommissions.length > 0) {
        const services = matchingCommissions.map(comm => ({
          product: comm.product,
          provider: comm.provider,
          qty: comm.qty,
          netBilled: comm.netBilled,
          installDate: comm.installDate,
          invoiceDate: comm.invoiceDate,
          agentComm: comm.agentComm
        }));
        
        matches.push({
          customer: locCustomer.original,
          address: locCustomer.fullAddress,
          city: locCustomer.city,
          state: locCustomer.state,
          services: services
        });
      } else {
        unmatched.push({
          customer: locCustomer.original,
          address: locCustomer.fullAddress,
          city: locCustomer.city,
          state: locCustomer.state
        });
      }
    });

    return { matches, unmatched };
  }, [fieldMapping.commissions]);

  // Analyze duplicates
  const analyzeDuplicates = useCallback((customers, locations) => {
    const customerDuplicates = detectDuplicates(customers, 'Customer', duplicateThreshold);
    const locationDuplicates = detectDuplicates(locations, 'Customer', duplicateThreshold);
    
    console.log('Analyzing duplicates:', {
      customerDuplicates,
      locationDuplicates
    });
    
    // Clear resolved duplicates when reanalyzing
    setResolvedDuplicates(new Map());
    
    setDuplicates({
      customers: customerDuplicates,
      locations: locationDuplicates
    });

    // If duplicates are found, show the panel
    if (customerDuplicates.length > 0 || locationDuplicates.length > 0) {
      setShowDuplicates(true);
    }
    
    return {
      customerDuplicates,
      locationDuplicates,
      totalDuplicateGroups: customerDuplicates.length + locationDuplicates.length
    };
  }, [detectDuplicates, duplicateThreshold]);

  // Resolve duplicate by selecting which record to keep
  const resolveDuplicate = useCallback((groupId, selectedItem, removedItems) => {
    setResolvedDuplicates(prev => new Map(prev.set(groupId, {
      selected: selectedItem,
      removed: removedItems
    })));
    
    // Mark the group as resolved in the duplicates state
    setDuplicates(prev => ({
      customers: prev.customers.map(group => 
        group.id === groupId ? { ...group, resolved: true } : group
      ),
      locations: prev.locations.map(group => 
        group.id === groupId ? { ...group, resolved: true } : group
      )
    }));
  }, []);

  // Update extracted data when user edits fields
  const updateExtractedData = useCallback((newData) => {
    setExtractedData(newData);
    // Re-analyze duplicates with updated data
    analyzeDuplicates(newData.customers, newData.locations);
  }, [analyzeDuplicates]);

  // Add this handler after other useCallback definitions, before the return statement
  const onSecondarySelectionChange = useCallback((selectedRecords) => {
    // Update the extracted data to mark which secondary records should be exported
    setExtractedData(prev => ({
      customers: prev.customers.map(customer => ({
        ...customer,
        includeInExport: !customer.isFromSecondary || 
          selectedRecords.has(`${customer.Customer}_${customer['Address 1']}`)
      })),
      locations: prev.locations.map(location => ({
        ...location,
        includeInExport: !location.isFromSecondary || 
          selectedRecords.has(`${location.Customer}_${location['Address 1']}`)
      }))
    }));

    // Update the filtered data for export
    const filterSecondaryRecords = (data) => {
      return data.filter(item => 
        !item.isFromSecondary || 
        selectedRecords.has(`${item.Customer || item.customer}_${item['Address 1'] || item.address}`)
      );
    };

    // Update enriched data if it exists
    if (enrichedData.matches.length > 0 || enrichedData.unmatched.length > 0) {
      setEnrichedData(prev => ({
        matches: filterSecondaryRecords(prev.matches),
        unmatched: filterSecondaryRecords(prev.unmatched)
      }));
    }
  }, []);

  // Utility functions
  const getServiceIcon = (product) => {
    if (!product) return <Package className="w-4 h-4 text-gray-400" />;
    
    const productLower = product.toLowerCase();
    
    if (productLower.includes('internet') || productLower.includes('broadband')) {
      return <Wifi className="w-4 h-4 text-blue-500" />;
    } else if (productLower.includes('phone') || productLower.includes('voice')) {
      return <Phone className="w-4 h-4 text-green-500" />;
    } else if (productLower.includes('data') || productLower.includes('ethernet')) {
      return <Globe className="w-4 h-4 text-purple-500" />;
    } else {
      return <Package className="w-4 h-4 text-gray-400" />;
    }
  };

  const formatCurrency = (amount) => {
    if (!amount || isNaN(amount)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(parseFloat(amount));
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  // Download enriched CSV function
  const downloadEnrichedCSV = useCallback(() => {
    const exportData = getFilteredDataForExport([...enrichedData.matches, ...enrichedData.unmatched]);
    
    const csvData = exportData.map(item => ({
      'Customer': item.customer,
      'Address': item.address,
      'City': item.city,
      'State': item.state,
      'Services Count': item.services ? item.services.length : 0,
      'Services': item.services ? item.services.map(s => s.product).join('; ') : '',
      'Providers': item.services ? item.services.map(s => s.provider).join('; ') : '',
      'Total Revenue': item.services ? item.services.reduce((sum, s) => sum + (parseFloat(s.netBilled) || 0), 0).toFixed(2) : '0.00'
    }));
    
    downloadCSV(csvData, 'telecom_directory_enriched.csv');
  }, [enrichedData, getFilteredDataForExport]);

  const handleSecondaryFileUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) {
      setError('Please select a file');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const sampleParsed = await parseFile(file, false);
      const fullParsed = await parseFile(file, true);
      
      setSecondaryFile(file);
      setSecondaryData(sampleParsed);
      setFullSecondaryData(fullParsed);
      
      // If we have primary data, merge and analyze
      if (fullOrdersData.data.length > 0) {
        const extracted = extractCompanyData(fullOrdersData, fullParsed);
        setExtractedData(extracted);

        // Analyze for duplicates including new records
        const duplicateAnalysis = analyzeDuplicates(extracted.customers, extracted.locations);
        
        // If new duplicates are found, show notification
        if (duplicateAnalysis.totalDuplicateGroups > totalDuplicateGroups) {
          setShowDuplicates(true);
          setError('New potential duplicates found in secondary file. Please review.');
        }
      }
    } catch (err) {
      setError(`Error processing secondary file: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }, [parseFile, fullOrdersData, extractCompanyData, analyzeDuplicates, totalDuplicateGroups]);

  const handleOrderFileUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) {
      setError('Please select a file');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const sampleParsed = await parseFile(file, false);
      const fullParsed = await parseFile(file, true);
      
      setOrderFile(file);
      setOrdersData(sampleParsed);
      setFullOrdersData(fullParsed);
      
      // Auto-detect field mappings
      autoDetectFieldMappings(sampleParsed.headers, 'orders');
    } catch (err) {
      setError(`Error processing orders file: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }, [parseFile, autoDetectFieldMappings]);

  const handleServiceFileUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) {
      setError('Please select a file');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const sampleParsed = await parseFile(file, false);
      const fullParsed = await parseFile(file, true);
      
      setServiceFile(file);
      setCommissionsData(sampleParsed);
      setFullCommissionsData(fullParsed);
      
      // Auto-detect field mappings
      autoDetectFieldMappings(sampleParsed.headers, 'commissions');
    } catch (err) {
      setError(`Error processing services file: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }, [parseFile, autoDetectFieldMappings]);

  // Add processStep1 function
  const processStep1 = useCallback(async () => {
    if (!orderFile) {
      setError('Please upload Orders CSV or Excel file');
      return;
    }
    
    setProcessing(true);
    setError('');
    
    try {
      const extracted = extractCompanyData(fullOrdersData, fullSecondaryData);
      setExtractedData(extracted);
      
      const duplicateAnalysis = analyzeDuplicates(extracted.customers, extracted.locations);
      if (duplicateAnalysis.totalDuplicateGroups > 0) {
        setShowDuplicates(true);
      }
      
      setCurrentStep(2);
    } catch (err) {
      setError(`Error processing files: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }, [orderFile, fullOrdersData, fullSecondaryData, extractCompanyData, analyzeDuplicates]);

  // Process step 2 (enrich with services)
  const processStep2 = useCallback(async () => {
    if (!serviceFile) {
      setError('Please upload Services CSV or Excel file');
      return;
    }
    
    if (!fieldMapping.commissions.customerField || !fieldMapping.commissions.serviceField) {
      setError('Please configure required field mappings');
      return;
    }
    
    setProcessing(true);
    setError('');
    
    try {
      const enriched = enrichWithServices(extractedData.locations, fullCommissionsData);
      setEnrichedData(enriched);
      setCurrentStep(3);
    } catch (err) {
      setError(`Error enriching data: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }, [serviceFile, fieldMapping.commissions, enrichWithServices, extractedData.locations, fullCommissionsData]);

  // Add the reset function
  const reset = useCallback(() => {
    // Reset step
    setCurrentStep(1);
    
    // Reset files
    setOrderFile(null);
    setServiceFile(null);
    setSecondaryFile(null);
    
    // Reset data
    setOrdersData({ headers: [], data: [] });
    setCommissionsData({ headers: [], data: [] });
    setSecondaryData({ headers: [], data: [] });
    setFullOrdersData({ headers: [], data: [] });
    setFullCommissionsData({ headers: [], data: [] });
    setFullSecondaryData({ headers: [], data: [] });
    
    // Reset results
    setExtractedData({ customers: [], locations: [] });
    setEnrichedData({ matches: [], unmatched: [] });
    
    // Reset UI states
    setDuplicates({ customers: [], locations: [] });
    setShowDuplicates(false);
    setResolvedDuplicates(new Map());
    setError('');
    setSearchTerm('');
    setSelectedFilter('all');
    setExportFields({ orders: [], commissions: [] });
    setShowExportConfig(false);
    
    // Reset field mappings
    resetMappings();
  }, [resetMappings]);

  // Update the main render section in WorkflowApp
  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">Enhanced Data Migration Workflow</h1>
        <p className="text-gray-600">
          Two-step process with smart field mapping and duplicate detection: Extract company data from orders, then enrich with service information (supports CSV and Excel files)
        </p>
      </div>

      {/* Progress Steps */}
      <ProgressSteps currentStep={currentStep} />

      {/* Error Alert */}
      <ErrorAlert error={error} />

      {/* Duplicate Detection Panel - Move it here, before other content */}
      {showDuplicates && (
        <DuplicateDetectionPanel
          duplicates={duplicates}
          showDuplicates={showDuplicates}
          onCloseDuplicates={() => setShowDuplicates(false)}
          onResolveDuplicate={resolveDuplicate}
          duplicateThreshold={duplicateThreshold}
          onThresholdChange={setDuplicateThreshold}
          extractedData={extractedData}
          onReanalyzeDuplicates={analyzeDuplicates}
        />
      )}

      {/* Duplicate Notification */}
      {currentStep >= 2 && totalDuplicateGroups > 0 && !showDuplicates && (
        <DuplicateNotification 
          duplicateCount={unresolvedDuplicateGroups}
          onShowDuplicates={setShowDuplicates}
          showDuplicates={showDuplicates}
        />
      )}

      {/* Step 1: Upload Orders File */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <FileUploadCard
            title="Step 1: Extract Company Data"
            description="Upload your orders/customers CSV or Excel file to extract unique company names and addresses. The system will automatically detect potential duplicates."
            file={orderFile}
            onFileUpload={handleOrderFileUpload}
            headers={ordersData.headers}
            previewData={ordersData.data}
            fullData={fullOrdersData.data}
            processing={processing}
          />

          {/* Secondary File Upload */}
          {orderFile && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Optional: Upload Secondary File</h2>
              <p className="text-gray-600 mb-6">
                Upload an additional orders/commissions file to find extra customers or locations not in the primary file. 
                New records will be highlighted in yellow in the preview tables.
              </p>
              
              <div className="max-w-md mx-auto mb-6">
                <div className="border-2 border-dashed border-orange-300 rounded-lg p-8 hover:border-orange-400 transition-colors">
                  <div className="text-center">
                    <Upload className="mx-auto h-16 w-16 text-orange-400 mb-4" />
                    <label className="cursor-pointer">
                      <span className="text-xl font-medium text-gray-700">Upload Secondary File</span>
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                        onChange={handleSecondaryFileUpload}
                        className="hidden"
                      />
                    </label>
                    <p className="text-sm text-gray-500 mt-2">CSV or Excel format (.csv, .xlsx, .xls)</p>
                    {secondaryFile && (
                      <div className="mt-4 flex items-center justify-center text-orange-600">
                        <CheckCircle className="h-5 w-5 mr-2" />
                        <span className="text-sm">{secondaryFile.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {secondaryData.headers.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <h4 className="font-medium text-orange-900 mb-2">Secondary File Fields ({secondaryData.headers.length})</h4>
                  <div className="max-h-32 overflow-y-auto">
                    <div className="grid grid-cols-3 gap-2 text-sm text-orange-700">
                      {secondaryData.headers.map((header, index) => (
                        <div key={index} className="truncate">{header}</div>
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-orange-600 mt-2">
                    Preview: {secondaryData.data.length} rows shown | Total: {fullSecondaryData.data.length} rows loaded for processing
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="text-center">
            <button
              onClick={processStep1}
              disabled={!orderFile || processing}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-8 rounded-lg transition-colors mr-4"
            >
              {processing ? 'Processing...' : 'Extract Company Data'}
            </button>
            
            {orderFile && (
              <button
                onClick={reset}
                className="bg-gray-500 hover:bg-gray-600 text-white font-medium py-3 px-8 rounded-lg transition-colors"
              >
                <X className="h-4 w-4 inline mr-2" />
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Field Configuration */}
      {currentStep === 2 && (
        <div className="space-y-6">
          {/* Step 1 Results Summary */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-green-800 mb-4">Step 1 Complete!</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="flex items-center">
                <Users className="h-6 w-6 text-green-600 mr-3" />
                <span className="text-green-700">
                  <strong>{extractedData.customers.length}</strong> unique customers extracted
                  {secondaryFile && (
                    <span className="text-orange-600 ml-2">
                      ({extractedData.customers.filter(c => c.isFromSecondary).length} from secondary)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center">
                <MapPin className="h-6 w-6 text-green-600 mr-3" />
                <span className="text-green-700">
                  <strong>{extractedData.locations.length}</strong> unique locations extracted
                  {secondaryFile && (
                    <span className="text-orange-600 ml-2">
                      ({extractedData.locations.filter(l => l.isFromSecondary).length} from secondary)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center">
                <AlertTriangle className="h-6 w-6 text-orange-500 mr-3" />
                <span className="text-orange-700">
                  <strong>{totalDuplicateGroups}</strong> potential duplicate groups found
                </span>
              </div>
            </div>
            {secondaryFile && (
              <div className="mt-4 p-3 bg-orange-100 border border-orange-200 rounded-lg">
                <p className="text-orange-800 text-sm">
                  <strong>Secondary file processed:</strong> {secondaryFile.name} - 
                  New records from secondary file are highlighted in yellow in the data preview tables below.
                </p>
              </div>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => downloadCSV(extractedData.customers, 'extracted_customers.csv')}
                className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded transition-colors"
              >
                <Download className="h-4 w-4 inline mr-1" />
                Download Customers
              </button>
              <button
                onClick={() => downloadCSV(extractedData.locations, 'extracted_locations.csv')}
                className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded transition-colors"
              >
                <Download className="h-4 w-4 inline mr-1" />
                Download Locations
              </button>
              {totalDuplicateGroups > 0 && (
                <button
                  onClick={() => {
                    console.log('Review Duplicates clicked');
                    console.log('Current state:', {
                     
                      totalDuplicateGroups,
                      duplicates,
                      showDuplicates
                    });
                    setShowDuplicates(true);
                  }}
                  className="text-sm bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded transition-colors"
                >
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  Review Duplicates
                </button>
              )}
            </div>
          </div>

          {/* Data Preview & Editing */}
          {extractedData.customers.length > 0 && (
            <DataPreviewPanel
              extractedData={extractedData}
              onUpdateData={updateExtractedData}
              onSecondarySelectionChange={onSecondarySelectionChange}
            />
          )}

          {/* Services File Upload */}
          <FileUploadCard
            title="Upload Services/Commission File"
            description="Upload your services/commissions CSV or Excel file to match services with the extracted company locations."
            file={serviceFile}
            onFileUpload={handleServiceFileUpload}
            headers={commissionsData.headers}
            previewData={commissionsData.data}
            fullData={fullCommissionsData.data}
            processing={processing}
          />

          {/* Field Mapping Interface */}
          {serviceFile && commissionsData.headers.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Configure Field Mapping</h2>
              <p className="text-gray-600 mb-6">Connect related fields between your Orders and Services files.</p>
              
              {/* Simplified field mapping interface */}
              <div className="space-y-4">
                {dynamicMappings.filter(m => m.required).map((mapping) => (
                  <div key={mapping.id} className="grid grid-cols-3 gap-4 items-center">
                    <div className="flex items-center gap-2">
                      <MappingIcon iconType={mapping.icon} />
                      <span className="font-medium">{mapping.label}</span>
                      <span className="text-red-500">*</span>
                    </div>
                    <select
                      value={fieldMapping.orders[mapping.ordersField] || ''}
                      onChange={(e) => setFieldMapping(prev => ({
                        ...prev,
                        orders: { ...prev.orders, [mapping.ordersField]: e.target.value }
                      }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select orders field...</option>
                      {ordersData.headers.map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                    <select
                      value={fieldMapping.commissions[mapping.commissionsField] || ''}
                      onChange={(e) => setFieldMapping(prev => ({
                        ...prev,
                        commissions: { ...prev.commissions, [mapping.commissionsField]: e.target.value }
                      }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select services field...</option>
                      {commissionsData.headers.map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button

              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Upload
            </button>
            <button
              onClick={processStep2}
              disabled={!serviceFile || processing || !fieldMapping.commissions.customerField || !fieldMapping.commissions.serviceField}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-8 rounded-lg transition-colors"
            >
              {processing ? 'Processing...' : 'Enrich with Services'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Results */}
      {currentStep === 3 && (
        <div className="space-y-6">
          {/* Results Header */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Telecom Services Directory</h1>
                <p className="mt-2 text-gray-600">Company locations and their associated telecom services</p>
                {resolvedDuplicates.size > 0 && (
                  <p className="mt-1 text-sm text-green-600">
                    ✓ {resolvedDuplicates.size} duplicate group(s) resolved - excluded from export
                  </p>
                )}
              </div>
              <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={downloadEnrichedCSV}
                  disabled={filteredData.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  Export CSV ({getFilteredDataForExport([...enrichedData.matches, ...enrichedData.unmatched]).length} records)
                </button>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search companies, addresses, or services..."
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-80"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <select
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={selectedFilter}
                  onChange={(e) => setSelectedFilter(e.target.value)}
                >
                  <option value="all">All Locations ({getFilteredDataForExport([...enrichedData.matches, ...enrichedData.unmatched]).length})</option>
                  <option value="matched">With Services ({getFilteredDataForExport(enrichedData.matches).length})</option>
                  <option value="unmatched">No Services ({getFilteredDataForExport(enrichedData.unmatched).length})</option>
                </select>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Showing {filteredData.length} results
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentStep(2)}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Back to Configure
              </button>
              <button
                onClick={reset}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Start New Workflow
              </button>
            </div>
          </div>

          {/* Results List */}
          <div className="grid gap-6">
            {filteredData.map((item, index) => (
              <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-gray-400 mt-1 flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-900 mb-1">{item.customer}</h3>
                      <p className="text-gray-600 mb-3">{item.address}</p>
                      
                      {item.services && item.services.length > 0 ? (
                        <div className="space-y-3">
                          <h4 className="text-lg font-medium text-gray-800 border-b border-gray-200 pb-2">
                            Active Services ({item.services.length})
                          </h4>
                          <div className="grid gap-3">
                            {item.services.map((service, serviceIndex) => (
                              <div key={serviceIndex} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                <div className="flex items-center gap-3 flex-1">
                                  {getServiceIcon(service.product)}
                                  <div>
                                    <p className="font-medium text-gray-900">{service.product}</p>
                                    <p className="text-sm text-gray-600">Provider: {service.provider}</p>
                                    {service.qty > 0 && (
                                      <p className="text-sm text-gray-600">Quantity: {service.qty}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="flex items-center gap-1 text-sm text-gray-600 mb-1">
                                    <DollarSign className="w-3 h-3" />
                                    <span>Billed: {formatCurrency(service.netBilled)}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-sm text-gray-600">
                                    <Calendar className="w-3 h-3" />
                                    <span>Invoice: {formatDate(service.invoiceDate)}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-yellow-800 font-medium">No Services Found</p>
                          <p className="text-yellow-600 text-sm mt-1">
                            This location doesn't have any associated telecom services in the commission data.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {filteredData.length === 0 && (
              <div className="text-center py-12">
                <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
                <p className="text-gray-600">Try adjusting your search terms or filters.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowApp;