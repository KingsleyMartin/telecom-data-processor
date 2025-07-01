"use client";

import { useState, useCallback, useMemo, useEffect } from 'react';
import { FileText, Upload, Download, Settings, Eye, EyeOff, Edit3, X, CheckCircle, AlertCircle, Info, AlertTriangle, Search, Zap, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';

// ============================================================================
// CONSTANTS
// ============================================================================

const STEPS = { UPLOAD: 1, WORKSHEET_SELECTION: 1.5, MAPPING: 2, RESULTS: 3 };

const FIELD_TYPES = ['companyName', 'address1', 'address2', 'city', 'state', 'zipCode', 'country'];

const FIELD_LABELS = {
  companyName: 'Company Name',
  address1: 'Address 1', 
  address2: 'Address 2',
  city: 'City',
  state: 'State',
  zipCode: 'Zip Code',
  country: 'Country'
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// String similarity utilities
const StringUtils = {
  levenshteinDistance: (str1, str2) => {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  },

  jaccardSimilarity: (str1, str2) => {
    const words1 = new Set(str1.toLowerCase().split(/\s+/).filter(word => word.length > 0));
    const words2 = new Set(str2.toLowerCase().split(/\s+/).filter(word => word.length > 0));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  },

  fuzzyWordMatch: (word1, word2) => {
    if (word1 === word2) return 1;
    
    const normalizeWord = (word) => {
      const abbrevMap = {
        'inc': 'incorporated', 'corp': 'corporation', 'co': 'company',
        'llc': 'limited liability company', 'ltd': 'limited', 'mech': 'mechanical',
        'svc': 'service', 'svcs': 'services', 'tech': 'technology',
        'sys': 'systems', 'sol': 'solutions', 'grp': 'group',
        'mgmt': 'management', 'dev': 'development', 'mfg': 'manufacturing',
        'dist': 'distribution', 'equip': 'equipment'
      };
      
      const normalized = word.toLowerCase().replace(/[^\w]/g, '');
      return abbrevMap[normalized] || normalized;
    };
    
    const norm1 = normalizeWord(word1);
    const norm2 = normalizeWord(word2);
    
    if (norm1 === norm2) return 0.9;
    
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      const minLen = Math.min(norm1.length, norm2.length);
      const maxLen = Math.max(norm1.length, norm2.length);
      return minLen / maxLen * 0.8;
    }
    
    const distance = StringUtils.levenshteinDistance(norm1, norm2);
    const maxLength = Math.max(norm1.length, norm2.length);
    return maxLength > 0 ? Math.max(0, 1 - distance / maxLength) : 0;
  },

  enhancedJaccardSimilarity: (str1, str2) => {
    const words1 = str1.toLowerCase().split(/\s+/).filter(word => word.length > 0);
    const words2 = str2.toLowerCase().split(/\s+/).filter(word => word.length > 0);
    
    let matchScore = 0;
    let totalWords = Math.max(words1.length, words2.length);
    
    const used2 = new Set();
    
    for (const word1 of words1) {
      let bestMatch = 0;
      let bestIndex = -1;
      
      for (let i = 0; i < words2.length; i++) {
        if (used2.has(i)) continue;
        const similarity = StringUtils.fuzzyWordMatch(word1, words2[i]);
        if (similarity > bestMatch && similarity > 0.7) {
          bestMatch = similarity;
          bestIndex = i;
        }
      }
      
      if (bestIndex !== -1) {
        matchScore += bestMatch;
        used2.add(bestIndex);
      }
    }
    
    return totalWords > 0 ? matchScore / totalWords : 0;
  },

  normalizeCompanyName: (name) => {
    const suffixes = /\b(inc|incorporated|corp|corporation|company|co|llc|limited liability company|ltd|limited)\b\.?$/gi;
    return name.replace(suffixes, '').trim();
  },

  calculateCompanySimilarity: (name1, name2) => {
    if (name1.toLowerCase() === name2.toLowerCase()) return 1;
    
    const norm1 = StringUtils.normalizeCompanyName(name1);
    const norm2 = StringUtils.normalizeCompanyName(name2);
    
    const jaccard = StringUtils.jaccardSimilarity(norm1, norm2);
    const enhancedJaccard = StringUtils.enhancedJaccardSimilarity(norm1, norm2);
    const levenshtein = 1 - StringUtils.levenshteinDistance(norm1.toLowerCase(), norm2.toLowerCase()) / 
                      Math.max(norm1.length, norm2.length);
    
    return (enhancedJaccard * 0.6) + (jaccard * 0.25) + (levenshtein * 0.15);
  }
};

// File parsing utilities
const FileUtils = {
  parseCSV: (content) => {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { headers: [], data: [] };

    const rawHeaders = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const headers = FileUtils.ensureUniqueHeaders(rawHeaders);

    const data = lines.slice(1).map(line => {
      const values = FileUtils.parseCSVLine(line);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });

    return { headers, data };
  },

  parseCSVLine: (line) => {
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
    return values;
  },

  ensureUniqueHeaders: (rawHeaders) => {
    const headers = [];
    const seenHeaders = new Set();
    
    rawHeaders.forEach((header) => {
      let uniqueHeader = header;
      let counter = 1;
      
      while (seenHeaders.has(uniqueHeader)) {
        uniqueHeader = `${header} (${counter})`;
        counter++;
      }
      
      seenHeaders.add(uniqueHeader);
      headers.push(uniqueHeader);
    });

    return headers;
  },

  parseExcel: (fileBuffer) => {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      
      if (workbook.SheetNames.length === 1) {
        return FileUtils.parseExcelSingleWorksheet(workbook);
      } else {
        return FileUtils.parseExcelMultipleWorksheets(workbook);
      }
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      return { headers: [], data: [] };
    }
  },

  parseExcelSingleWorksheet: (workbook) => {
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length === 0) return { headers: [], data: [] };

    const rawHeaders = jsonData[0].map(h => String(h || '').trim());
    const headers = FileUtils.ensureUniqueHeaders(rawHeaders);

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
  },

  parseExcelMultipleWorksheets: (workbook) => {
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
      
      let score = FileUtils.calculateWorksheetScore(headers, dataRows);
      
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
  },

  calculateWorksheetScore: (headers, dataRows) => {
    let score = 0;
    
    const relevantKeywords = ['company', 'customer', 'business', 'organization', 'client', 'address', 'city', 'state', 'zip', 'location', 'type', 'status', 'country'];
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
    
    return score;
  },

  parseExcelWorksheet: (fileBuffer, worksheetIndex) => {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[worksheetIndex];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length === 0) return { headers: [], data: [] };

      const rawHeaders = jsonData[0].map(h => String(h || '').trim());
      const headers = FileUtils.ensureUniqueHeaders(rawHeaders);

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
  }
};

// Data processing utilities
const DataUtils = {
  detectColumnMappings: (headers) => {
    const mapping = {};
    
    const fieldMatchers = {
      companyName: (header) => {
        const lower = header.toLowerCase();
        return ['customer', 'company', 'business', 'organization', 'client'].some(keyword => 
          lower.includes(keyword) && !lower.includes('id') && !lower.includes('contact') && !lower.includes('account')
        );
      },
      locationName: (header) => {
        const lower = header.toLowerCase();
        return ['location name', 'site name', 'facility name', 'branch name'].some(keyword => 
          lower.includes(keyword)
        ) || (lower.includes('location') && lower.includes('name'));
      },
      locationType: (header) => {
        const lower = header.toLowerCase();
        return ['location type', 'site type', 'facility type', 'branch type'].some(keyword => 
          lower.includes(keyword)
        ) || (lower.includes('location') && lower.includes('type'));
      },
      status: (header) => {
        const lower = header.toLowerCase();
        return ['status', 'state', 'condition'].some(keyword => 
          lower === keyword || (lower.includes(keyword) && !lower.includes('account'))
        );
      },
      address1: (header) => {
        const lower = header.toLowerCase();
        return lower === 'address 1' || 
               (lower.includes('address') && lower.includes('1') && 
                !lower.includes('account') && !lower.includes('('));
      },
      address2: (header) => {
        const lower = header.toLowerCase();
        return lower === 'address 2' || lower === ' address 2' || 
               (lower.includes('address') && lower.includes('2') && 
                !lower.includes('account') && !lower.includes('('));
      },
      city: (header) => {
        const lower = header.toLowerCase();
        return lower === 'city' || 
               (lower.includes('city') && !lower.includes('account') && 
                !lower.includes(',') && !lower.includes('('));
      },
      state: (header) => {
        const lower = header.toLowerCase();
        return lower === 'state' || 
               (lower.includes('state') && !lower.includes('account') && 
                !lower.includes(',') && !lower.includes('('));
      },
      zipCode: (header) => {
        const lower = header.toLowerCase();
        return lower === 'postal code' || lower === 'zip code' || lower === 'zipcode' || lower === 'zip' ||
               (lower.includes('postal') && !lower.includes('account') && !lower.includes('('));
      },
      country: (header) => {
        const lower = header.toLowerCase();
        return ['country', 'nation'].some(keyword => 
          lower.includes(keyword) && !lower.includes('account')
        );
      }
    };

    headers.forEach((header, index) => {
      Object.entries(fieldMatchers).forEach(([fieldType, matcher]) => {
        if (!mapping[fieldType] && matcher(header)) {
          mapping[fieldType] = header;
          console.log(`Auto-mapped ${fieldType} to "${header}" at position ${index}`);
        }
      });
    });

    return mapping;
  },

  findNearDuplicateCompanies: (records, files, primaryFileIndex) => {
    const companyGroups = new Map();
    
    records.forEach((record, index) => {
      const companyKey = record.companyName.toLowerCase().trim();
      if (!companyGroups.has(companyKey)) {
        companyGroups.set(companyKey, []);
      }
      companyGroups.get(companyKey).push({ ...record, originalIndex: index });
    });
    
    const uniqueCompanies = Array.from(companyGroups.keys()).sort();
    const nearDuplicateGroups = [];
    const processed = new Set();
    
    for (let i = 0; i < uniqueCompanies.length; i++) {
      if (processed.has(uniqueCompanies[i])) continue;
      
      const currentGroup = [uniqueCompanies[i]];
      processed.add(uniqueCompanies[i]);
      
      for (let j = i + 1; j < Math.min(i + 10, uniqueCompanies.length); j++) {
        if (processed.has(uniqueCompanies[j])) continue;
        
        const similarity = StringUtils.calculateCompanySimilarity(uniqueCompanies[i], uniqueCompanies[j]);
        
        if (similarity >= 0.75) {
          currentGroup.push(uniqueCompanies[j]);
          processed.add(uniqueCompanies[j]);
        }
      }
      
      if (currentGroup.length > 1) {
        nearDuplicateGroups.push(currentGroup);
      }
    }
    
    const updatedRecords = [...records];
    
    nearDuplicateGroups.forEach(group => {
      const canonical = group.reduce((best, current) => {
        const currentRecords = companyGroups.get(current);
        const bestRecords = companyGroups.get(best);
        
        const currentFromPrimary = currentRecords.some(r => r.source === files[primaryFileIndex]?.name);
        const bestFromPrimary = bestRecords.some(r => r.source === files[primaryFileIndex]?.name);
        
        if (currentFromPrimary && !bestFromPrimary) return current;
        if (!currentFromPrimary && bestFromPrimary) return best;
        
        return current.length > best.length ? current : best;
      });
      
      group.forEach(companyName => {
        if (companyName !== canonical) {
          const recordsToUpdate = companyGroups.get(companyName);
          recordsToUpdate.forEach(record => {
            updatedRecords[record.originalIndex] = {
              ...updatedRecords[record.originalIndex],
              companyName: companyGroups.get(canonical)[0].companyName,
              isNearDuplicate: true,
              originalCompanyName: record.companyName
            };
          });
        }
      });
    });
    
    return updatedRecords;
  },

  analyzeRecordIssues: (record) => {
    const issues = [];

    // Check for missing or incomplete address components
    if (!record.address1 || record.address1.trim().length < 3) {
      issues.push('Missing or incomplete address');
    }
    
    if (!record.city || record.city.trim().length < 2) {
      issues.push('Missing or incomplete city');
    }
    
    if (!record.state || record.state.trim().length < 2) {
      issues.push('Missing or incomplete state');
    }
    
    if (!record.zipCode || record.zipCode.trim().length < 5) {
      issues.push('Missing or incomplete zip code');
    }
    
    // Check for potential incomplete zip codes (less than 5 digits)
    if (record.zipCode && record.zipCode.trim().length > 0 && record.zipCode.trim().length < 5) {
      issues.push('Incomplete zip code');
    }

    // Check for suspicious zip codes (all zeros, repeated digits)
    if (record.zipCode && /^0+$/.test(record.zipCode.trim())) {
      issues.push('Invalid zip code (all zeros)');
    }

    // Check for missing company name after standardization
    if (!record.companyName || record.companyName.trim().length < 2) {
      issues.push('Missing or incomplete company name');
    }

    // Check for generic/placeholder values
    const placeholderPattern = /\b(unknown|n\/a|none|null|blank|empty|tbd|tba)\b/i;
    if (placeholderPattern.test(record.address1) || placeholderPattern.test(record.city)) {
      issues.push('Placeholder address values detected');
    }

    return issues;
  }
};

// ============================================================================
// CUSTOM HOOKS
// ============================================================================

// Snackbar hook
const useSnackbar = () => {
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((notification) => {
    const id = Date.now() + Math.random();
    const newNotification = { id, ...notification };
    
    setNotifications(prev => [...prev, newNotification]);

    // Auto-remove after duration (default 5 seconds)
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

// ============================================================================
// UI COMPONENTS
// ============================================================================

// Snackbar Components
const Snackbar = ({ notification, onClose }) => {
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
};

const SnackbarContainer = ({ notifications, onRemove }) => {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      {notifications.map((notification) => (
        <Snackbar
          key={notification.id}
          notification={notification}
          onClose={() => onRemove(notification.id)}
        />
      ))}
    </div>
  );
};

// Step Indicator Component
const StepIndicator = ({ currentStep }) => {
  const stepLabels = {
    1: 'Upload Files',
    1.5: 'Select Worksheets',
    2: 'Map Columns',
    3: 'Review Results'
  };

  const displaySteps = currentStep === 1.5 ? [1, 1.5, 2, 3] : [1, 2, 3];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {displaySteps.map((stepNumber, index) => (
          <div key={stepNumber} className={`flex items-center ${index < displaySteps.length - 1 ? 'flex-1' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              currentStep >= stepNumber ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
            }`}>
              {stepNumber === 1.5 ? '📊' : Math.floor(stepNumber)}
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
};

// Progress Indicator Component
const ProgressIndicator = ({ current, total, label = "Standardizing Records..." }) => {
  const percentage = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-blue-700">
          {label}
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
        Please wait while we process your records...
      </p>
    </div>
  );
};

// File Upload Step Component
const FileUploadStep = ({ onFileUpload, onImportProgress }) => {
  const acceptedTypes = '.csv,.xlsx,.xls';
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev + 1);
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev - 1);
    if (dragCounter <= 1) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragCounter(0);

    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter(file => {
      const fileName = file.name.toLowerCase();
      return fileName.endsWith('.csv') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    });

    if (validFiles.length > 0) {
      const mockEvent = {
        target: {
          files: validFiles
        }
      };
      onFileUpload(mockEvent);
    }
  };

  return (
    <div className="space-y-6">
      <div 
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 ${
          isDragging 
            ? 'border-blue-500 bg-blue-50 border-solid' 
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <Upload className={`mx-auto h-12 w-12 mb-4 transition-colors ${
          isDragging ? 'text-blue-500' : 'text-gray-400'
        }`} />
        <div className={`text-lg font-medium mb-2 transition-colors ${
          isDragging ? 'text-blue-700' : 'text-gray-700'
        }`}>
          {isDragging ? 'Drop files here to upload' : 'Upload CSV or Excel Files'}
        </div>
        <div className={`text-gray-500 mb-4 ${
          isDragging ? 'text-blue-600' : 'text-gray-500'
        }`}>
          {isDragging 
            ? 'Release to upload your files'
            : 'Drag and drop files here, or click to select files'
          }
        </div>
        <div className="text-xs text-gray-400 mb-4">
          Supported formats: CSV (.csv), Excel (.xlsx, .xls)
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
          className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md cursor-pointer transition-colors ${
            isDragging 
              ? 'text-blue-700 bg-blue-100 hover:bg-blue-200' 
              : 'text-white bg-blue-600 hover:bg-blue-700'
          }`}
        >
          Choose Files
        </label>
      </div>

      <div className="border-t border-gray-200 pt-6">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-700 mb-2">Or Continue Previous Work</h3>
          <p className="text-sm text-gray-500 mb-4">
            If you have a previously saved progress file, you can load it to continue where you left off
          </p>
          <input
            type="file"
            accept=".json"
            onChange={onImportProgress}
            className="hidden"
            id="progress-upload-main"
          />
          <label
            htmlFor="progress-upload-main"
            className="inline-flex items-center px-4 py-2 border border-purple-300 text-purple-700 bg-purple-50 rounded-md hover:bg-purple-100 cursor-pointer transition-colors"
          >
            <Upload size={16} className="mr-2" />
            Load Saved Progress
          </label>
        </div>
      </div>
    </div>
  );
};

// Worksheet Selection Step Component
const WorksheetSelectionStep = ({ filesWithWorksheets, onWorksheetSelection, onContinue }) => {
  return (
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
  );
};

// Column Mapping Step Component
const ColumnMappingStep = ({ files, columnMappings, primaryFileIndex, mappingName, onUpdateMapping, onSetPrimaryFile, onProcessFiles, onSetMappingName, onExportMapping, onImportMapping }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <Settings className="text-blue-600" />
          Map Columns
        </h2>
        <button
          onClick={onProcessFiles}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Process Files
        </button>
      </div>

      {/* Mapping Save/Load Section */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
          <Download className="text-green-600" size={16} />
          TSD Field Mappings
        </h3>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Save Mapping */}
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
                className={`px-4 py-2 rounded-md border flex items-center gap-2 ${
                  !mappingName.trim()
                    ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                    : 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                }`}
              >
                <Download size={16} />
                Save
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Downloads a JSON file with your current field mappings
            </p>
          </div>

          {/* Load Mapping */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Load Saved Mapping
            </label>
            <div className="flex gap-2">
              <input
                type="file"
                accept=".json"
                onChange={onImportMapping}
                className="hidden"
                id="mapping-upload"
              />
              <label
                htmlFor="mapping-upload"
                className="flex-1 cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                <Upload size={16} className="mr-2" />
                Choose Mapping File
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Upload a previously saved mapping JSON file
            </p>
          </div>
        </div>
      </div>

      {files.length > 1 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
            <FileText className="text-yellow-600" size={16} />
            Select Primary File
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            Choose which file should be processed first. Records from the primary file will take priority in deduplication.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {files.map((file, index) => (
              <label key={index} className="flex items-center gap-2 cursor-pointer p-2 border rounded hover:bg-gray-50">
                <input
                  type="radio"
                  name="primaryFile"
                  value={index}
                  checked={primaryFileIndex === index}
                  onChange={(e) => onSetPrimaryFile(parseInt(e.target.value))}
                  className="text-blue-600"
                />
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-700 truncate block">{file.name}</span>
                  {primaryFileIndex === index && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-1 py-0.5 rounded">
                      Primary
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {files.map((file, fileIndex) => (
          <div key={fileIndex} className={`border rounded-lg p-4 ${fileIndex === primaryFileIndex ? 'border-blue-300 bg-blue-50' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-800">{file.name}</h3>
              {fileIndex === primaryFileIndex && (
                <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded">
                  Primary File
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {FIELD_TYPES.map(fieldType => (
                <div key={fieldType}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {FIELD_LABELS[fieldType]}
                    {fieldType === 'companyName' && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </label>
                  <select
                    value={columnMappings[fileIndex]?.[fieldType] || 'none'}
                    onChange={(e) => onUpdateMapping(fileIndex, fieldType, e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
    </div>
  );
};

// Modal Components
const OriginalDataModal = ({ isOpen, record, onClose }) => {
  if (!isOpen || !record || !record.originalData) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Original Data vs Standardized</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-gray-700 mb-3 text-center">Original Data</h3>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
                {Object.entries(FIELD_LABELS).map(([key, label]) => (
                  <div key={key}><strong>{label}:</strong> {record.originalData[key]}</div>
                ))}
              </div>
            </div>
            
            <div>
              <h3 className="font-medium text-gray-700 mb-3 text-center">Standardized Data</h3>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                {Object.entries(FIELD_LABELS).map(([key, label]) => (
                  <div key={key}><strong>{label}:</strong> {record[key]}</div>
                ))}
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
    </div>
  );
};

const NearDuplicateModal = ({ isOpen, record, onClose }) => {
  if (!isOpen || !record || !record.isNearDuplicate) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-500 rounded-full" />
            Near Duplicate Company Name Normalization
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-gray-700 mb-3 text-center">Original Company Name</h3>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-center">
                  <div className="text-lg font-medium text-gray-800 mb-2">
                    "{record.originalCompanyName}"
                  </div>
                  <div className="text-sm text-gray-600">
                    As it appeared in: <span className="font-medium">{record.source}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="font-medium text-gray-700 mb-3 text-center">Normalized Company Name</h3>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="text-center">
                  <div className="text-lg font-medium text-gray-800 mb-2">
                    "{record.companyName}"
                  </div>
                  <div className="text-sm text-gray-600">
                    Canonical version chosen from all similar variations
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-700 mb-2">Complete Record Context</h4>
            <div className="text-sm text-gray-600 space-y-1">
              <div><strong>Location:</strong> {record.address1} {record.city}, {record.state} {record.zipCode}</div>
              {record.locationName && <div><strong>Location Name:</strong> {record.locationName}</div>}
              {record.locationType && <div><strong>Location Type:</strong> {record.locationType}</div>}
              {record.status && <div><strong>Status:</strong> {record.status}</div>}
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
    </div>
  );
};

const FindReplaceModal = ({ isOpen, field, fieldLabel, data, onClose, onReplace }) => {
  const [findValue, setFindValue] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [previewChanges, setPreviewChanges] = useState([]);

  const generatePreview = useCallback(() => {
    if (!findValue.trim()) {
      setPreviewChanges([]);
      return;
    }

    const changes = [];
    data.forEach((record, index) => {
      const currentValue = record[field] || '';
      let searchText = findValue;
      let targetText = currentValue;

      if (!caseSensitive) {
        searchText = searchText.toLowerCase();
        targetText = targetText.toLowerCase();
      }

      let hasMatch = false;
      if (wholeWord) {
        const regex = new RegExp(`\\b${searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, caseSensitive ? 'g' : 'gi');
        hasMatch = regex.test(currentValue);
      } else {
        hasMatch = targetText.includes(searchText);
      }

      if (hasMatch) {
        let newValue;
        if (wholeWord) {
          const regex = new RegExp(`\\b${findValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, caseSensitive ? 'g' : 'gi');
          newValue = currentValue.replace(regex, replaceValue);
        } else {
          const regex = new RegExp(findValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
          newValue = currentValue.replace(regex, replaceValue);
        }

        if (newValue !== currentValue) {
          changes.push({
            index,
            companyName: record.companyName,
            oldValue: currentValue,
            newValue: newValue
          });
        }
      }
    });

    setPreviewChanges(changes);
  }, [findValue, replaceValue, caseSensitive, wholeWord, data, field]);

  useEffect(() => {
    generatePreview();
  }, [generatePreview]);

  const handleReplace = () => {
    if (previewChanges.length > 0) {
      onReplace(field, previewChanges);
      onClose();
    }
  };

  const resetForm = () => {
    setFindValue('');
    setReplaceValue('');
    setCaseSensitive(false);
    setWholeWord(false);
    setPreviewChanges([]);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <Search className="text-blue-600" />
            Find & Replace - {fieldLabel}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>
        
        <div className="space-y-6">
          {/* Find and Replace Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Find
              </label>
              <input
                type="text"
                value={findValue}
                onChange={(e) => setFindValue(e.target.value)}
                placeholder="Enter text to find..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Replace with
              </label>
              <input
                type="text"
                value={replaceValue}
                onChange={(e) => setReplaceValue(e.target.value)}
                placeholder="Enter replacement text..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Options */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Case sensitive</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={wholeWord}
                onChange={(e) => setWholeWord(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Whole word only</span>
            </label>
          </div>

          {/* Preview */}
          <div>
            <h3 className="font-medium text-gray-800 mb-3">
              Preview Changes ({previewChanges.length} record{previewChanges.length !== 1 ? 's' : ''} will be updated)
            </h3>
            {findValue.trim() === '' ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-500 text-center">Enter text to find to see preview</p>
              </div>
            ) : previewChanges.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-700 text-center">No matches found</p>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                <div className="space-y-3">
                  {previewChanges.slice(0, 50).map((change, index) => (
                    <div key={index} className="bg-white border border-gray-200 rounded p-3">
                      <div className="text-sm font-medium text-gray-600 mb-2">
                        {change.companyName}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-red-600 font-medium">From: </span>
                          <span className="bg-red-100 px-1 rounded">{change.oldValue}</span>
                        </div>
                        <div>
                          <span className="text-green-600 font-medium">To: </span>
                          <span className="bg-green-100 px-1 rounded">{change.newValue}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {previewChanges.length > 50 && (
                    <div className="text-center text-sm text-gray-500">
                      ... and {previewChanges.length - 50} more changes
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleReplace}
              disabled={previewChanges.length === 0}
              className={`px-4 py-2 rounded-md ${
                previewChanges.length === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              Replace All ({previewChanges.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Results Step Component
const ResultsStep = ({ processedData, filteredData, selectedRecords, selectedCount, showMissingAddresses, showDuplicates, showReviewOnly, editingCell, isStandardizing, isAnalyzing, files, primaryFileIndex, progressName, workflowButtons, workflowStep, onToggleRecordSelection, onToggleSelectAll, onCellEdit, onCellClick, onCellBlur, onToggleMissingAddresses, onToggleDuplicates, onToggleReviewFilter, onAnalyzeRecords, onRemoveDuplicates, onStandardizeRemaining, onExport, onReset, onViewOriginalData, onViewNearDuplicateData, onOpenFindReplace, onSetProgressName, onExportProgress, onImportProgress }) => {
  const selectableFilteredData = filteredData.filter(record => processedData.indexOf(record) !== -1);
  const allVisibleSelected = selectableFilteredData.length > 0 && 
    selectableFilteredData.every(record => selectedRecords.has(processedData.indexOf(record)));

  const renderEditableCell = (record, field, originalIndex) => {
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
  };

  const renderColumnHeader = (field, label, minWidth) => (
    <th className={`border border-gray-300 px-2 py-2 text-left ${minWidth}`}>
      <div className="flex items-center justify-between group">
        <span>{label}</span>
        <button
          onClick={() => onOpenFindReplace(field, label)}
          className="opacity-0 group-hover:opacity-70 hover:opacity-100 p-1 rounded hover:bg-gray-200 transition-all"
          title={`Find & replace in ${label}`}
        >
          <Search size={14} className="text-gray-600" />
        </button>
      </div>
    </th>
  );

  // Workflow progress indicator
  const WorkflowProgress = () => (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <h3 className="font-medium text-blue-800 mb-3">Data Cleaning Workflow</h3>
      <div className="flex items-center justify-between">
        {[
          { step: 1, label: 'Remove Duplicates', active: workflowStep === 1, completed: workflowStep > 1 },
          { step: 2, label: 'Standardize Records', active: workflowStep === 2, completed: workflowStep > 2 },
          { step: 3, label: 'Analyze Records', active: workflowStep === 3, completed: workflowStep > 3 },
          { step: 4, label: 'Export Clean Data', active: workflowStep === 4, completed: false }
        ].map((item, index) => (
          <div key={item.step} className={`flex items-center ${index < 3 ? 'flex-1' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              item.completed ? 'bg-green-600 text-white' :
              item.active ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
            }`}>
              {item.completed ? '✓' : item.step}
            </div>
            <span className={`ml-2 text-sm ${
              item.completed ? 'text-green-600' :
              item.active ? 'text-blue-600' : 'text-gray-500'
            }`}>
              {item.label}
            </span>
            {index < 3 && (
              <div className={`flex-1 h-0.5 mx-4 ${
                workflowStep > item.step ? 'bg-green-600' : 
                workflowStep === item.step ? 'bg-blue-600' : 'bg-gray-300'
              }`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-gray-800">
          Extracted Companies ({filteredData.length} records, {selectedCount} selected)
        </h2>
      </div>

      <WorkflowProgress />

      {/* Main Workflow Buttons */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="font-medium text-gray-800 mb-4">Data Cleaning Actions</h3>
        <div className="flex flex-wrap gap-3">
          {/* Step 1: Remove Duplicates */}
          <button
            onClick={onRemoveDuplicates}
            disabled={!workflowButtons.removeDuplicates.enabled || workflowButtons.removeDuplicates.loading}
            className={`px-4 py-2 rounded-md border flex items-center gap-2 ${
              !workflowButtons.removeDuplicates.enabled || workflowButtons.removeDuplicates.loading
                ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                : workflowStep === 1 
                  ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                  : 'bg-green-100 text-green-700 border-green-300'
            }`}
          >
            {workflowButtons.removeDuplicates.loading ? (
              <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : workflowStep > 1 ? (
              <CheckCircle size={16} />
            ) : (
              <X size={16} />
            )}
            {workflowButtons.removeDuplicates.label}
          </button>

          {/* Step 2: Standardize */}
          <button
            onClick={onStandardizeRemaining}
            disabled={!workflowButtons.standardize.enabled || workflowButtons.standardize.loading}
            className={`px-4 py-2 rounded-md border flex items-center gap-2 ${
              !workflowButtons.standardize.enabled || workflowButtons.standardize.loading
                ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                : workflowStep === 2
                  ? 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700'
                  : workflowStep > 2
                    ? 'bg-green-100 text-green-700 border-green-300'
                    : 'bg-gray-100 text-gray-400 border-gray-300'
            }`}
          >
            {workflowButtons.standardize.loading ? (
              <Settings size={16} className="animate-spin" />
            ) : workflowStep > 2 ? (
              <CheckCircle size={16} />
            ) : (
              <Settings size={16} />
            )}
            {workflowButtons.standardize.label}
          </button>

          {/* Step 3: Analyze */}
          <button
            onClick={onAnalyzeRecords}
            disabled={!workflowButtons.analyze.enabled || workflowButtons.analyze.loading}
            className={`px-4 py-2 rounded-md border flex items-center gap-2 ${
              !workflowButtons.analyze.enabled || workflowButtons.analyze.loading
                ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                : workflowStep === 3
                  ? 'bg-yellow-600 text-white border-yellow-600 hover:bg-yellow-700'
                  : workflowStep > 3
                    ? 'bg-green-100 text-green-700 border-green-300'
                    : 'bg-gray-100 text-gray-400 border-gray-300'
            }`}
          >
            {workflowButtons.analyze.loading ? (
              <Search size={16} className="animate-spin" />
            ) : workflowStep > 3 ? (
              <CheckCircle size={16} />
            ) : (
              <Search size={16} />
            )}
            {workflowButtons.analyze.label}
          </button>

          {/* Step 4: Export */}
          <button
            onClick={onExport}
            disabled={!workflowButtons.export.enabled}
            className={`px-4 py-2 rounded-md border flex items-center gap-2 ${
              !workflowButtons.export.enabled
                ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                : 'bg-green-600 text-white border-green-600 hover:bg-green-700'
            }`}
          >
            <Download size={16} />
            {workflowButtons.export.label}
          </button>
        </div>
      </div>

      {/* Secondary Filter Controls */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onToggleDuplicates}
          className={`px-3 py-1 text-sm rounded-md border flex items-center gap-2 ${
            showDuplicates
              ? 'bg-gray-100 text-gray-700 border-gray-300'
              : 'bg-orange-100 text-orange-700 border-orange-300'
          }`}
        >
          {showDuplicates ? <EyeOff size={14} /> : <Eye size={14} />}
          {showDuplicates ? 'Hide' : 'Show'} All Duplicates
        </button>

        <button
          onClick={onToggleMissingAddresses}
          className={`px-3 py-1 text-sm rounded-md border flex items-center gap-2 ${
            showMissingAddresses
              ? 'bg-gray-100 text-gray-700 border-gray-300'
              : 'bg-blue-100 text-blue-700 border-blue-300'
          }`}
        >
          {showMissingAddresses ? <EyeOff size={14} /> : <Eye size={14} />}
          {showMissingAddresses ? 'Hide' : 'Show'} Incomplete Address
        </button>

        <button
          onClick={onToggleReviewFilter}
          className={`px-3 py-1 text-sm rounded-md border flex items-center gap-2 ${
            showReviewOnly
              ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          <Filter size={14} />
          {showReviewOnly ? 'Show All Records' : 'Show Issues Only'}
        </button>
      </div>

      {/* Progress Save/Load Section */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
          <Download className="text-purple-600" size={16} />
          Save & Load Progress
        </h3>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Save Current Progress
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={progressName}
                onChange={(e) => onSetProgressName(e.target.value)}
                placeholder="Enter progress save name..."
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
              <button
                onClick={onExportProgress}
                disabled={!progressName.trim() || processedData.length === 0}
                className={`px-4 py-2 rounded-md border flex items-center gap-2 ${
                  !progressName.trim() || processedData.length === 0
                    ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                    : 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700'
                }`}
              >
                <Download size={16} />
                Save
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Downloads a JSON file with your current data and all edits
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Load Saved Progress
            </label>
            <div className="flex gap-2">
              <input
                type="file"
                accept=".json"
                onChange={onImportProgress}
                className="hidden"
                id="progress-upload"
              />
              <label
                htmlFor="progress-upload"
                className="flex-1 cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                <Upload size={16} className="mr-2" />
                Choose Progress File
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Upload a previously saved progress JSON file to continue working
            </p>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
      <p className="text-sm text-blue-700 flex items-center gap-2">
        <Edit3 size={16} />
        <strong>Tip:</strong> Click on any cell to edit its contents directly. Check any row to include it for export (removes strikethrough/italic styling). Uncheck rows to exclude them and restore issue indicators. Use search icons in headers for bulk find & replace.
      </p>
    </div>

      <div className="overflow-x-auto border border-gray-300 rounded-lg">
        <div className="min-w-full">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-2 text-left w-12">
                  <input
                    type="checkbox"
                    onChange={onToggleSelectAll}
                    checked={allVisibleSelected}
                    className="rounded"
                  />
                </th>
                {renderColumnHeader('companyName', 'Company Name', 'min-w-[200px]')}
                {renderColumnHeader('address1', 'Address 1', 'min-w-[200px]')}
                {renderColumnHeader('address2', 'Address 2', 'min-w-[150px]')}
                {renderColumnHeader('city', 'City', 'min-w-[120px]')}
                {renderColumnHeader('state', 'State', 'min-w-[80px]')}
                {renderColumnHeader('zipCode', 'Zip Code', 'min-w-[100px]')}
                {renderColumnHeader('country', 'Country', 'min-w-[100px]')}
                <th className="border border-gray-300 px-2 py-2 text-left min-w-[120px]">Source</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((record, index) => {
                let rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';

                if (record.isDuplicateRemoved) {
                  rowClass = 'bg-red-100';
                } else if (record.isAdditionalDuplicate) {
                  rowClass = 'bg-red-50';
                } else if (record.hasIncompleteAddress) {
                  rowClass = 'bg-blue-50';
                } else if (record.isDuplicate) {
                  rowClass = 'bg-yellow-100';
                } else if (record.isNearDuplicate) {
                  rowClass = 'bg-orange-100';
                } else if (record.isSimilar) {
                  rowClass = 'bg-red-100';
                } else if (record.isStandardized) {
                  rowClass = index % 2 === 0 ? 'bg-green-50' : 'bg-green-100';
                }

                if (record.hasAnalysisIssues) {
                  rowClass += ' border-l-4 border-yellow-500';
                }

                const originalIndex = processedData.indexOf(record);

                // Determine text styling based on selection status
                const isSelected = originalIndex !== -1 && selectedRecords.has(originalIndex);
                let textClass = '';

                if (!isSelected) {
                  // Only apply styling if the record is not selected
                  if (record.isDuplicateRemoved || record.isAdditionalDuplicate) {
                    textClass = 'line-through';
                  } else if (record.hasIncompleteAddress) {
                    textClass = 'italic';
                  }
                }
                // If selected, use normal text style regardless of record type

                return (
                  <tr key={index} className={rowClass}>
                    <td className="border border-gray-300 px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={originalIndex !== -1 && selectedRecords.has(originalIndex)}
                        onChange={() => originalIndex !== -1 && onToggleRecordSelection(originalIndex)}
                        className="rounded"
                      />
                    </td>
                    <td className={`border border-gray-300 px-1 py-1 relative ${textClass}`}>
                      {renderEditableCell(record, 'companyName', originalIndex)}
                      {record.isStandardized && (
                        <div className="absolute top-1 right-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewOriginalData(record);
                            }}
                            className="w-2 h-2 bg-green-500 rounded-full hover:bg-green-600 cursor-pointer transition-colors"
                            title="Click to view original data before standardization"
                          />
                        </div>
                      )}
                      {record.isNearDuplicate && (
                        <div className="absolute top-1 left-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewNearDuplicateData(record);
                            }}
                            className="w-2 h-2 bg-orange-500 rounded-full hover:bg-orange-600 cursor-pointer transition-colors"
                            title={`Near duplicate detected. Click to view details. Original name: "${record.originalCompanyName}"`}
                          />
                        </div>
                      )}
                      {(record.isDuplicateRemoved || record.hasRedDot) && (
                        <div className="absolute top-1 left-1">
                          <div 
                            className="w-2 h-2 bg-red-500 rounded-full"
                            title={record.isDuplicateRemoved ? `Removed as duplicate: ${record.removedReason}` : record.additionalDuplicateReason || 'Duplicate record'}
                          />
                        </div>
                      )}
                      {record.hasBlueDot && (
                        <div className="absolute bottom-1 left-1">
                          <div 
                            className="w-2 h-2 bg-blue-500 rounded-full"
                            title="Missing or incomplete address information"
                          />
                        </div>
                      )}
                      {record.hasAnalysisIssues && (
                        <div className="absolute bottom-1 right-1">
                          <div 
                            className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"
                            title={`Analysis issues detected: ${record.analysisIssues?.join(', ')}`}
                          />
                        </div>
                      )}
                    </td>
                    <td className={`border border-gray-300 px-1 py-1 ${textClass}`}>
                      {renderEditableCell(record, 'address1', originalIndex)}
                    </td>
                    <td className={`border border-gray-300 px-1 py-1 ${textClass}`}>
                      {renderEditableCell(record, 'address2', originalIndex)}
                    </td>
                    <td className={`border border-gray-300 px-1 py-1 ${textClass}`}>
                      {renderEditableCell(record, 'city', originalIndex)}
                    </td>
                    <td className={`border border-gray-300 px-1 py-1 ${textClass}`}>
                      {renderEditableCell(record, 'state', originalIndex)}
                    </td>
                    <td className={`border border-gray-300 px-1 py-1 ${textClass}`}>
                      {renderEditableCell(record, 'zipCode', originalIndex)}
                    </td>
                    <td className={`border border-gray-300 px-1 py-1 ${textClass}`}>
                      {renderEditableCell(record, 'country', originalIndex)}
                    </td>
                    <td className={`border border-gray-300 px-1 py-1 text-sm ${textClass}`}>
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        record.source === files[primaryFileIndex]?.name 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {record.source}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
        <button
          onClick={onReset}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
        >
          Start Over
        </button>
        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
          <div className="flex items-center">
            <input type="checkbox" checked readOnly className="mr-2 rounded" />
            Selected (normal text style)
          </div>
          <div className="flex items-center">
            <input type="checkbox" readOnly className="mr-2 rounded" />
            Unselected (shows issue styling)
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-red-100 border border-red-300 mr-2" />
            Initial duplicates (removed)
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-red-50 border border-red-300 mr-2" />
            Additional duplicates (analysis)
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-blue-50 border border-blue-300 mr-2" />
            Incomplete addresses
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 mr-2" />
            Exact duplicates
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-orange-100 border border-orange-300 mr-2" />
            Near duplicate companies
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-100 border border-green-300 mr-2" />
            Standardized records
          </div>
          <div className="flex items-center">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 cursor-pointer" />
            Click to view original data
          </div>
          <div className="flex items-center">
            <div className="w-2 h-2 bg-orange-500 rounded-full mr-2 cursor-pointer" />
            Click to view near duplicate details
          </div>
          <div className="flex items-center">
            <div className="w-2 h-2 bg-red-500 rounded-full mr-2" />
            Duplicate records (red dot)
          </div>
          <div className="flex items-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full mr-2" />
            Incomplete address (blue dot)
          </div>
          <div className="flex items-center">
            <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse" />
            Analysis issues detected
          </div>
          <div className="flex items-center">
            <span className="line-through mr-2">Text</span>
            Strikethrough = duplicate
          </div>
          <div className="flex items-center">
            <span className="italic mr-2">Text</span>
            Italics = incomplete address
          </div>
          <div className="flex items-center">
            <Edit3 size={14} className="mr-2 text-gray-400" />
            Click cells to edit
          </div>
          <div className="flex items-center">
            <Search size={14} className="mr-2 text-gray-400" />
            Find & replace in headers
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN HOOK - BUSINESS LOGIC
// ============================================================================

const useCustomerExtractor = () => {
  // State
  const [files, setFiles] = useState([]);
  const [filesWithWorksheets, setFilesWithWorksheets] = useState([]);
  const [processedData, setProcessedData] = useState([]);
  const [columnMappings, setColumnMappings] = useState({});
  const [primaryFileIndex, setPrimaryFileIndex] = useState(0);
  const [showMissingAddresses, setShowMissingAddresses] = useState(true);
  const [showDuplicates, setShowDuplicates] = useState(true);
  const [showReviewOnly, setShowReviewOnly] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState(new Set());
  const [editingCell, setEditingCell] = useState(null);
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [isStandardizing, setIsStandardizing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [standardizationProgress, setStandardizationProgress] = useState({ current: 0, total: 0 });
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });
  const [mappingName, setMappingName] = useState('');
  const [showOriginalModal, setShowOriginalModal] = useState(false);
  const [selectedOriginalRecord, setSelectedOriginalRecord] = useState(null);
  const [showNearDuplicateModal, setShowNearDuplicateModal] = useState(false);
  const [selectedNearDuplicateRecord, setSelectedNearDuplicateRecord] = useState(null);
  const [showFindReplaceModal, setShowFindReplaceModal] = useState(false);
  const [findReplaceField, setFindReplaceField] = useState(null);
  const [findReplaceFieldLabel, setFindReplaceFieldLabel] = useState('');
  const [progressName, setProgressName] = useState('');
  
  // New state for tracking original row to company mapping
  const [originalRowToCompanyMapping, setOriginalRowToCompanyMapping] = useState(new Map());
  
  // New workflow state
  const [workflowStep, setWorkflowStep] = useState(1); // 1: Remove Duplicates, 2: Standardize, 3: Analyze, 4: Export
  const [isRemovingDuplicates, setIsRemovingDuplicates] = useState(false);

  // Snackbar
  const { notifications, removeNotification, showSuccess, showError, showWarning, showInfo } = useSnackbar();

  // Standardization API call
  const standardizeWithGemini = async (companyName, address, locationName = '', locationType = '', country = '', status = '') => {
    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          companyName, 
          address, 
          locationName, 
          locationType, 
          country, 
          status 
        }),
      });

      if (!response.ok) throw new Error(`API call failed: ${response.status}`);
      const result = await response.json();

      if (result.success && result.data) {
        return {
          companyName: result.data["Company Name"] || companyName,
          locationName: result.data["Location Name"] || locationName,
          locationType: result.data["Location Type"] || locationType,
          status: result.data["Status"] || 'Active',
          address1: result.data["Address 1"] || '',
          address2: result.data["Address 2"] || '',
          city: result.data["City"] || '',
          state: result.data["State"] || '',
          zipCode: result.data["Zip Code"] || '',
          country: result.data["Country"] || country
        };
      } else {
        throw new Error('Invalid response from API');
      }
    } catch (error) {
      console.error('Error calling standardization API:', error);
      return {
        companyName: companyName,
        locationName: locationName,
        locationType: locationType,
        status: status,
        address1: address,
        address2: '',
        city: '',
        state: '',
        zipCode: '',
        country: country
      };
    }
  };

  // Step 1: Remove duplicates using Levenshtein and Jaccard
  const removeDuplicates = useCallback(async () => {
    if (processedData.length === 0) {
      showWarning('No data to process. Please upload and process files first.');
      return;
    }

    setIsRemovingDuplicates(true);
    setAnalysisProgress({ current: 0, total: processedData.length });

    try {
      const duplicateGroups = new Map();
      
      // Group records by similarity using both exact matches and fuzzy matching
      for (let i = 0; i < processedData.length; i++) {
        setAnalysisProgress({ current: i + 1, total: processedData.length });
        
        const record = processedData[i];
        if (record.isProcessed) continue;
        
        const group = [record];
        record.isProcessed = true;
        
        // Find similar records
        for (let j = i + 1; j < processedData.length; j++) {
          const otherRecord = processedData[j];
          if (otherRecord.isProcessed) continue;
          
          // Calculate company name similarity
          const companySimilarity = StringUtils.calculateCompanySimilarity(record.companyName, otherRecord.companyName);
          
          // Calculate address similarity
          const addr1 = `${record.address1} ${record.city} ${record.state}`.toLowerCase().trim();
          const addr2 = `${otherRecord.address1} ${otherRecord.city} ${otherRecord.state}`.toLowerCase().trim();
          const addressSimilarity = StringUtils.jaccardSimilarity(addr1, addr2);
          
          // If company names are very similar AND addresses are similar, consider as duplicate
          if (companySimilarity > 0.85 && addressSimilarity > 0.7) {
            group.push(otherRecord);
            otherRecord.isProcessed = true;
          }
        }
        
        if (group.length > 1) {
          duplicateGroups.set(i, group);
        }
      }

      // Process duplicate groups and uncheck duplicates
      const deduplicatedRecords = [...processedData];
      const uncheckedIndices = new Set();
      
      duplicateGroups.forEach(group => {
        // Sort by completeness and source priority
        group.sort((a, b) => {
          // Prefer primary file records
          const primaryFileName = files[primaryFileIndex]?.name;
          const aIsPrimary = a.source === primaryFileName ? 1 : 0;
          const bIsPrimary = b.source === primaryFileName ? 1 : 0;
          
          if (aIsPrimary !== bIsPrimary) return bIsPrimary - aIsPrimary;
          
          // Prefer records with more complete data
          const aCompleteness = [a.address1, a.address2, a.city, a.state, a.zipCode, a.locationName, a.locationType, a.country, a.status].filter(Boolean).length;
          const bCompleteness = [b.address1, b.address2, b.city, b.state, b.zipCode, b.locationName, b.locationType, b.country, b.status].filter(Boolean).length;
          return bCompleteness - aCompleteness;
        });
        
        // Keep the best record checked, mark others as unchecked duplicates
        const bestRecord = group[0];
        const bestIndex = processedData.indexOf(bestRecord);
        deduplicatedRecords[bestIndex] = { ...bestRecord, isDuplicateKept: true, duplicateGroup: group.length };
        
        // Mark others as duplicates and uncheck them
        for (let i = 1; i < group.length; i++) {
          const recordIndex = processedData.indexOf(group[i]);
          uncheckedIndices.add(recordIndex);
          deduplicatedRecords[recordIndex] = { 
            ...group[i], 
            isDuplicateRemoved: true, 
            isStrikethrough: true,
            hasRedDot: true,
            removedReason: `Duplicate of ${bestRecord.companyName}` 
          };
        }
      });

      // Clean up processing flags
      deduplicatedRecords.forEach(record => {
        delete record.isProcessed;
      });

      // Update selected records to uncheck duplicates
      setSelectedRecords(prev => {
        const newSelected = new Set(prev);
        uncheckedIndices.forEach(index => newSelected.delete(index));
        return newSelected;
      });

      setProcessedData(deduplicatedRecords);
      
      const removedCount = uncheckedIndices.size;
      const groupCount = duplicateGroups.size;
      
      showSuccess(
        `Duplicate removal complete! Found ${groupCount} duplicate group${groupCount !== 1 ? 's' : ''} and unchecked ${removedCount} duplicate record${removedCount !== 1 ? 's' : ''}. Duplicates are marked with strikethrough and red dots.`,
        'Duplicates Removed'
      );
      
      setWorkflowStep(2);
      
    } catch (error) {
      console.error('Error removing duplicates:', error);
      showError('An error occurred while removing duplicates. Please try again.');
    } finally {
      setIsRemovingDuplicates(false);
      setAnalysisProgress({ current: 0, total: 0 });
    }
  }, [processedData, files, primaryFileIndex, showSuccess, showError, showWarning]);

 // Step 2: Standardize remaining checked records
  const standardizeRemainingRecords = useCallback(async () => {
    const checkedRecords = processedData.filter((record, index) => 
      selectedRecords.has(index) && !record.isDuplicateRemoved
    );
    
    if (checkedRecords.length === 0) {
      showWarning('No checked records to standardize. Please ensure records are selected and duplicates have been removed first.');
      return;
    }

    setIsStandardizing(true);
    setStandardizationProgress({ current: 0, total: checkedRecords.length });
    
    try {
      const updatedData = [...processedData];
      const processedKeys = new Set(); // Track which duplicate groups we've already processed
      let totalUpdatedRecords = 0;
      
      for (let i = 0; i < checkedRecords.length; i++) {
        const record = checkedRecords[i];
        const originalIndex = processedData.indexOf(record);
        
        if (record.isDuplicateRemoved || !selectedRecords.has(originalIndex)) continue;

        setStandardizationProgress({ current: i + 1, total: checkedRecords.length });

        // Create a key to identify duplicate records
        const duplicateKey = `${record.companyName.toLowerCase().trim()}_${record.address1.toLowerCase().trim()}_${record.city.toLowerCase().trim()}`;
        
        // Skip if we've already processed this duplicate group
        if (processedKeys.has(duplicateKey)) continue;
        processedKeys.add(duplicateKey);

        const fullAddressParts = [record.address1, record.address2, record.city, record.state, record.zipCode].filter(Boolean);
        const fullAddress = fullAddressParts.join(', ');

        const standardized = fullAddress.trim() 
          ? await standardizeWithGemini(record.companyName, fullAddress, record.locationName, record.locationType, record.status, record.country)
          : {
              companyName: record.companyName.replace(/\b\w/g, l => l.toUpperCase()).trim(),
              locationName: record.locationName,
              locationType: record.locationType,
              status: record.status,
              address1: '', address2: '', city: '', state: '', zipCode: '',
              country: record.country
            };

        // Find all matching duplicate records (including the current one)
        const matchingRecords = [];
        processedData.forEach((otherRecord, otherIndex) => {
          const otherKey = `${otherRecord.companyName.toLowerCase().trim()}_${otherRecord.address1.toLowerCase().trim()}_${otherRecord.city.toLowerCase().trim()}`;
          if (otherKey === duplicateKey) {
            matchingRecords.push({ record: otherRecord, index: otherIndex });
          }
        });

        // Apply standardization to all matching records and update the mapping
        matchingRecords.forEach(({ record: matchRecord, index: matchIndex }) => {
          const updatedRecord = { 
            ...matchRecord, 
            ...standardized, 
            isStandardized: true,
            originalData: {
              companyName: matchRecord.companyName,
              locationName: matchRecord.locationName,
              locationType: matchRecord.locationType,
              status: matchRecord.status,
              address1: matchRecord.address1,
              address2: matchRecord.address2,
              city: matchRecord.city,
              state: matchRecord.state,
              zipCode: matchRecord.zipCode,
              country: matchRecord.country
            }
          };
          
          updatedData[matchIndex] = updatedRecord;

          // Update the mapping for this processed record to point to the standardized data
          if (matchRecord.originalFileIndex !== undefined && matchRecord.originalRowIndex !== undefined) {
            const mappingKey = `${matchRecord.originalFileIndex}-${matchRecord.originalRowIndex}`;
            setOriginalRowToCompanyMapping(prev => {
              const updated = new Map(prev);
              updated.set(mappingKey, {
                companyName: standardized.companyName,
                address1: standardized.address1,
                address2: standardized.address2,
                city: standardized.city,
                state: standardized.state,
                zipCode: standardized.zipCode,
                country: standardized.country
              });
              return updated;
            });
          }
        });

        totalUpdatedRecords += matchingRecords.length;
      }

      setProcessedData(updatedData);
      
      const standardizedCount = checkedRecords.length;
      
      showSuccess(
        `Standardization complete! Processed ${standardizedCount} checked record${standardizedCount !== 1 ? 's' : ''} and updated ${totalUpdatedRecords} total record${totalUpdatedRecords !== 1 ? 's' : ''} (including duplicates). Ready for analysis to identify additional issues.`,
        'Standardization Complete'
      );
      
      setWorkflowStep(3);
      
    } catch (error) {
      console.error('Error standardizing records:', error);
      showError('An error occurred while standardizing the records. Please try again.');
    } finally {
      setIsStandardizing(false);
      setStandardizationProgress({ current: 0, total: 0 });
    }
  }, [processedData, selectedRecords, showSuccess, showError, showWarning]);

  // Step 3: Analyze records to find additional duplicates and incomplete addresses
  const analyzeRecords = useCallback(async () => {
    const standardizedRecords = processedData.filter(r => r.isStandardized && !r.isDuplicateRemoved);
    
    if (standardizedRecords.length === 0) {
      showWarning('No standardized records to analyze. Please standardize records first.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress({ current: 0, total: standardizedRecords.length });
    
    try {
      const updatedData = [...processedData];
      const uncheckedIndices = new Set();
      
      // Step 1: Find additional duplicates from standardized data
      const duplicateGroups = new Map();
      
      for (let i = 0; i < standardizedRecords.length; i++) {
        setAnalysisProgress({ current: i + 1, total: standardizedRecords.length });
        
        const record = standardizedRecords[i];
        if (record.isAnalyzed) continue;
        
        const group = [record];
        record.isAnalyzed = true;
        
        // Find similar standardized records
        for (let j = i + 1; j < standardizedRecords.length; j++) {
          const otherRecord = standardizedRecords[j];
          if (otherRecord.isAnalyzed) continue;
          
          // Check for exact matches after standardization
          const key1 = `${record.companyName.toLowerCase().trim()}_${record.address1.toLowerCase().trim()}_${record.city.toLowerCase().trim()}`;
          const key2 = `${otherRecord.companyName.toLowerCase().trim()}_${otherRecord.address1.toLowerCase().trim()}_${otherRecord.city.toLowerCase().trim()}`;
          
          if (key1 === key2) {
            group.push(otherRecord);
            otherRecord.isAnalyzed = true;
          }
        }
        
        if (group.length > 1) {
          duplicateGroups.set(i, group);
        }
      }

      // Process additional duplicate groups
      let additionalDuplicatesFound = 0;
      duplicateGroups.forEach(group => {
        // Sort by completeness and source priority
        group.sort((a, b) => {
          const primaryFileName = files[primaryFileIndex]?.name;
          const aIsPrimary = a.source === primaryFileName ? 1 : 0;
          const bIsPrimary = b.source === primaryFileName ? 1 : 0;
          
          if (aIsPrimary !== bIsPrimary) return bIsPrimary - aIsPrimary;
          
          const aCompleteness = [a.address1, a.address2, a.city, a.state, a.zipCode, a.locationName, a.locationType, a.country, a.status].filter(Boolean).length;
          const bCompleteness = [b.address1, b.address2, b.city, b.state, b.zipCode, b.locationName, b.locationType, b.country, b.status].filter(Boolean).length;
          return bCompleteness - aCompleteness;
        });
        
        // Keep the best record, mark others as additional duplicates
        for (let i = 1; i < group.length; i++) {
          const recordIndex = processedData.indexOf(group[i]);
          uncheckedIndices.add(recordIndex);
          updatedData[recordIndex] = {
            ...updatedData[recordIndex],
            isAdditionalDuplicate: true,
            isStrikethrough: true,
            hasRedDot: true,
            additionalDuplicateReason: `Additional duplicate of ${group[0].companyName}`
          };
          additionalDuplicatesFound++;
        }
      });

      // Step 2: Check for incomplete addresses and uncheck them
      let incompleteAddressCount = 0;
      processedData.forEach((record, index) => {
        if (record.isDuplicateRemoved || record.isAdditionalDuplicate) return;
        
        // Check if address is incomplete
        const hasIncompleteAddress = !record.address1 || !record.city || !record.state || !record.zipCode || 
                                   record.address1.trim().length < 3 || record.city.trim().length < 2 || 
                                   record.state.trim().length < 2 || record.zipCode.trim().length < 5;
        
        if (hasIncompleteAddress) {
          uncheckedIndices.add(index);
          updatedData[index] = {
            ...updatedData[index],
            hasIncompleteAddress: true,
            isItalic: true,
            hasBlueDot: true
          };
          incompleteAddressCount++;
        }
      });

      // Clean up analysis flags
      updatedData.forEach(record => {
        delete record.isAnalyzed;
      });

      // Update selected records to uncheck analyzed issues
      setSelectedRecords(prev => {
        const newSelected = new Set(prev);
        uncheckedIndices.forEach(index => newSelected.delete(index));
        return newSelected;
      });

      setProcessedData(updatedData);
      
      showSuccess(
        `Analysis complete! Found ${additionalDuplicatesFound} additional duplicate${additionalDuplicatesFound !== 1 ? 's' : ''} (marked with strikethrough and red dots) and ${incompleteAddressCount} record${incompleteAddressCount !== 1 ? 's' : ''} with incomplete addresses (marked in italics with blue dots). These records have been unchecked.`,
        'Analysis Complete'
      );
      
      setWorkflowStep(4);
      
    } catch (error) {
      console.error('Error analyzing records:', error);
      showError('An error occurred while analyzing the records. Please try again.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress({ current: 0, total: 0 });
    }
  }, [processedData, files, primaryFileIndex, showSuccess, showError, showWarning]);

  // Computed values
  const filteredData = useMemo(() => {
  let filtered = [...processedData];
  
  if (!showMissingAddresses) {
    filtered = filtered.filter(record => record.address1 && record.city && record.state && record.zipCode);
  }
  
  if (!showDuplicates) {
    filtered = filtered.filter(record => !record.isDuplicate && !record.isDuplicateRemoved && !record.isAdditionalDuplicate);
  }
  
  if (showReviewOnly) {
    filtered = filtered.filter(record => record.hasAnalysisIssues || record.isDuplicateRemoved);
  }
  
  return filtered;
}, [processedData, showMissingAddresses, showDuplicates, showReviewOnly]);

  const selectedCount = useMemo(() => 
    filteredData.filter(record => {
      const originalIndex = processedData.indexOf(record);
      return originalIndex !== -1 && selectedRecords.has(originalIndex);
    }).length,
    [filteredData, processedData, selectedRecords]
  );

  // Update the workflowButtons logic in useCustomerExtractor
  const workflowButtons = useMemo(() => {
    const totalRecords = processedData.length;
    const checkedRecords = processedData.filter((record, index) => selectedRecords.has(index)).length;
    const duplicatesRemoved = processedData.filter(r => r.isDuplicateRemoved).length;
    const standardizedRecords = processedData.filter(r => r.isStandardized).length;
    const additionalDuplicates = processedData.filter(r => r.isAdditionalDuplicate).length;
    const incompleteAddresses = processedData.filter(r => r.hasIncompleteAddress).length;

    return {
      removeDuplicates: {
        enabled: processedData.length > 0 && workflowStep === 1,
        label: `Remove Duplicates (${totalRecords} records)`,
        loading: isRemovingDuplicates
      },
      standardize: {
        // Modified to stay enabled after step 2
        enabled: checkedRecords > 0 && workflowStep >= 2,
        label: workflowStep === 2 
          ? `Standardize Records (${checkedRecords} checked)`
          : `Re-Standardize Records (${checkedRecords} selected)`,
        loading: isStandardizing
      },
      analyze: {
        enabled: standardizedRecords > 0 && workflowStep === 3,
        label: `Analyze Records (${standardizedRecords} standardized)`,
        loading: isAnalyzing
      },
      export: {
        enabled: workflowStep >= 4 && checkedRecords > 0,
        label: `Export Clean Data (${checkedRecords} checked)`,
        loading: false
      }
    };
  }, [
    processedData, 
    selectedRecords, 
    workflowStep, 
    isRemovingDuplicates, 
    isStandardizing, 
    isAnalyzing
  ]);

  // File upload handler
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
          parsed = FileUtils.parseCSV(content);
          
          if (parsed.headers.length > 0 && parsed.data.length > 0) {
            fileData.push({
              name: file.name,
              headers: parsed.headers,
              data: parsed.data
            });
          }
        } else if (fileName.match(/\.(xlsx|xls)$/)) {
          const buffer = await file.arrayBuffer();
          parsed = FileUtils.parseExcel(buffer);
          
          if (parsed.isMultiWorksheet) {
            filesNeedingWorksheetSelection.push({
              name: file.name,
              buffer: buffer,
              worksheets: parsed.worksheets,
              recommendedWorksheetIndex: parsed.recommendedWorksheetIndex,
              selectedWorksheetIndex: parsed.recommendedWorksheetIndex
            });
          } else if (parsed.headers.length > 0 && parsed.data.length > 0) {
            fileData.push({
              name: file.name,
              headers: parsed.headers,
              data: parsed.data
            });
          }
        } else {
          console.warn(`Unsupported file type: ${file.name}`);
          continue;
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
          initialMappings[index] = DataUtils.detectColumnMappings(file.headers);
        });
        setColumnMappings(initialMappings);

        const orderFileIndex = fileData.findIndex(file => file.name.toLowerCase().includes('order'));
        setPrimaryFileIndex(orderFileIndex >= 0 ? orderFileIndex : 0);
        setStep(STEPS.MAPPING);
        showSuccess(`Successfully processed ${fileData.length} file(s). Column mappings have been automatically detected where possible.`, 'Files Uploaded');
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      showError('An error occurred while processing the files. Please try again.');
    }
  }, [showSuccess, showError, showInfo]);

  // Other handler functions
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
        const parsed = FileUtils.parseExcelWorksheet(fileWithWorksheets.buffer, fileWithWorksheets.selectedWorksheetIndex);
        
        if (parsed.headers.length > 0 && parsed.data.length > 0) {
          processedWorksheetFiles.push({
            name: fileWithWorksheets.name,
            headers: parsed.headers,
            data: parsed.data
          });
        }
      }

      const allFiles = [...files, ...processedWorksheetFiles];
      setFiles(allFiles);

      const initialMappings = {};
      allFiles.forEach((file, index) => {
        initialMappings[index] = DataUtils.detectColumnMappings(file.headers);
      });
      setColumnMappings(initialMappings);

      const orderFileIndex = allFiles.findIndex(file => file.name.toLowerCase().includes('order'));
      setPrimaryFileIndex(orderFileIndex >= 0 ? orderFileIndex : 0);
      setStep(STEPS.MAPPING);
      showSuccess(`Successfully processed ${allFiles.length} file(s) with selected worksheets.`, 'Worksheets Processed');
    } catch (error) {
      console.error('Error processing worksheet selections:', error);
      showError('An error occurred while processing the worksheet selections. Please try again.');
    }
  }, [files, filesWithWorksheets, showSuccess, showError]);

  const updateColumnMapping = useCallback((fileIndex, field, column) => {
    setColumnMappings(prev => ({
      ...prev,
      [fileIndex]: {
        ...prev[fileIndex],
        [field]: column === 'none' ? null : column
      }
    }));
  }, []);

  const processFiles = useCallback(async () => {
    try {
      const allRecords = [];
      const rowMapping = new Map(); // Track original file/row to processed record mapping
      const primaryFile = files[primaryFileIndex];
      const otherFiles = files.filter((_, index) => index !== primaryFileIndex);
      const orderedFiles = [primaryFile, ...otherFiles];

      for (const file of orderedFiles) {
        const fileIndex = files.indexOf(file);
        const mapping = columnMappings[fileIndex];

        for (let rowIndex = 0; rowIndex < file.data.length; rowIndex++) {
          const row = file.data[rowIndex];
          if (!mapping.companyName || !row[mapping.companyName]) continue;

          const companyName = row[mapping.companyName];
          const locationName = mapping.locationName ? row[mapping.locationName] || '' : '';
          const locationType = mapping.locationType ? row[mapping.locationType] || '' : '';
          const status = mapping.status ? row[mapping.status] || '' : '';
          const address1 = mapping.address1 ? row[mapping.address1] || '' : '';
          const address2 = mapping.address2 ? row[mapping.address2] || '' : '';
          const city = mapping.city ? row[mapping.city] || '' : '';
          const state = mapping.state ? row[mapping.state] || '' : '';
          const zipCode = mapping.zipCode ? row[mapping.zipCode] || '' : '';
          const country = mapping.country ? row[mapping.country] || '' : '';

          const hasAddressInfo = [address1, city, state, zipCode].some(field => 
            field && field.trim().length > 0
          );
          
          if (!hasAddressInfo) {
            console.log(`Skipping row for company "${companyName}" - no address information found`);
            continue;
          }

          const fullAddressParts = [address1, address2, city, state, zipCode].filter(Boolean);
          const fullAddress = fullAddressParts.join(', ');

          const processedRecord = {
            companyName: companyName.trim(),
            locationName: locationName.trim(),
            locationType: locationType.trim(),
            status: status.trim(),
            address1: address1.trim(),
            address2: address2.trim(),
            city: city.trim(),
            state: state.trim(),
            zipCode: zipCode.trim(),
            country: country.trim(),
            source: file.name,
            originalAddress: fullAddress,
            originalFileIndex: fileIndex,
            originalRowIndex: rowIndex,
            isStandardized: false,
            hasAnalysisIssues: false,
            analysisIssues: []
          };

          allRecords.push(processedRecord);

          // Store the mapping from original file/row to the initial company data
          const mappingKey = `${fileIndex}-${rowIndex}`;
          rowMapping.set(mappingKey, {
            companyName: companyName.trim(),
            address1: address1.trim(),
            address2: address2.trim(),
            city: city.trim(),
            state: state.trim(),
            zipCode: zipCode.trim(),
            country: country.trim()
          });
        }
      }

      console.log('Detecting near-duplicate company names...');
      const recordsWithNormalizedNames = DataUtils.findNearDuplicateCompanies(allRecords, files, primaryFileIndex);
      
      const nearDuplicateCount = recordsWithNormalizedNames.filter(record => record.isNearDuplicate).length;
      if (nearDuplicateCount > 0) {
        showInfo(`Detected ${nearDuplicateCount} near-duplicate company names that have been normalized. Look for orange indicators in the results.`, 'Near Duplicates Found');
      }
      
      const uniqueRecords = [];
      const duplicateGroups = new Map();

      for (let i = 0; i < recordsWithNormalizedNames.length; i++) {
        const record = recordsWithNormalizedNames[i];
        const key = `${record.companyName.toLowerCase().trim()}_${record.address1.toLowerCase().trim()}_${record.city.toLowerCase().trim()}`;

        if (!duplicateGroups.has(key)) {
          duplicateGroups.set(key, []);
        }
        duplicateGroups.get(key).push({ ...record, originalProcessedDataIndex: i });
      }

      duplicateGroups.forEach(group => {
        group.sort((a, b) => {
          const primaryFileName = files[primaryFileIndex]?.name;
          const aIsPrimary = a.source === primaryFileName ? 1 : 0;
          const bIsPrimary = b.source === primaryFileName ? 1 : 0;
          
          if (aIsPrimary !== bIsPrimary) return bIsPrimary - aIsPrimary;
          
          const aCompleteness = [a.address1, a.address2, a.city, a.state, a.zipCode, a.locationName, a.locationType, a.country, a.status].filter(Boolean).length;
          const bCompleteness = [b.address1, b.address2, b.city, b.state, b.zipCode, b.locationName, b.locationType, b.country, b.status].filter(Boolean).length;
          return bCompleteness - aCompleteness;
        });

        const bestRecord = { ...group[0], isDuplicate: false, isSelectableDuplicate: true };
        uniqueRecords.push(bestRecord);

        for (let i = 1; i < group.length; i++) {
          uniqueRecords.push({ ...group[i], isDuplicate: true, isSelectableDuplicate: false });
        }
      });

      // Detect similar addresses for same company
      for (let i = 0; i < uniqueRecords.length; i++) {
        for (let j = i + 1; j < uniqueRecords.length; j++) {
          const record1 = uniqueRecords[i];
          const record2 = uniqueRecords[j];

          if (record1.companyName.toLowerCase() === record2.companyName.toLowerCase() &&
              !record1.isDuplicate && !record2.isDuplicate &&
              record1.address1 && record2.address1) {

            const addr1 = record1.address1.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 15);
            const addr2 = record2.address1.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 15);

            if (addr1.length >= 3 && addr2.length >= 3) {
              const minLength = Math.min(addr1.length, addr2.length);
              let matches = 0;

              for (let k = 0; k < minLength; k++) {
                if (addr1[k] === addr2[k]) {
                  matches++;
                } else {
                  break;
                }
              }

              if ((matches / minLength) >= 0.8) {
                uniqueRecords[i].isSimilar = true;
                uniqueRecords[j].isSimilar = true;
              }
            }
          }
        }
      }

      uniqueRecords.sort((a, b) => {
        const nameCompare = a.companyName.localeCompare(b.companyName);
        if (nameCompare !== 0) return nameCompare;
        return a.address1.localeCompare(b.address1);
      });

      setProcessedData(uniqueRecords);
      setOriginalRowToCompanyMapping(rowMapping);
      
      // Reset workflow to step 1 for new data
      setWorkflowStep(1);
      
      // Initially check ALL records
      const initialSelection = new Set();
      uniqueRecords.forEach((record, index) => {
        initialSelection.add(index);
      });
      setSelectedRecords(initialSelection);
      
      setStep(STEPS.RESULTS);
      const nearDuplicatesText = nearDuplicateCount > 0 ? ` ${nearDuplicateCount} near-duplicate companies were normalized.` : '';
      showSuccess(`Successfully processed ${uniqueRecords.length} records from ${files.length} file(s).${nearDuplicatesText} All records are initially checked. Start with "Remove Duplicates" to begin the data cleaning workflow.`, 'Processing Complete');
    } catch (error) {
      console.error('Error processing files:', error);
      showError('An error occurred while processing the files. Please try again.');
    }
  }, [files, columnMappings, primaryFileIndex, showSuccess, showError, showInfo]);

  const standardizeRecords = async (indices) => {
    setIsStandardizing(true);
    setStandardizationProgress({ current: 0, total: indices.length });
    
    try {
      const updatedData = [...processedData];
      
      for (let i = 0; i < indices.length; i++) {
        const recordIndex = indices[i];
        const record = updatedData[recordIndex];
        if (!record) continue;

        setStandardizationProgress({ current: i + 1, total: indices.length });

        const fullAddressParts = [record.address1, record.address2, record.city, record.state, record.zipCode].filter(Boolean);
        const fullAddress = fullAddressParts.join(', ');

        const standardized = fullAddress.trim() 
          ? await standardizeWithGemini(record.companyName, fullAddress, record.locationName, record.locationType, record.status, record.country)
          : {
              companyName: record.companyName.replace(/\b\w/g, l => l.toUpperCase()).trim(),
              locationName: record.locationName,
              locationType: record.locationType,
              status: record.status,
              address1: '', address2: '', city: '', state: '', zipCode: '',
              country: record.country
            };

        updatedData[recordIndex] = { 
          ...record, 
          ...standardized, 
          isStandardized: true,
          originalData: {
            companyName: record.companyName,
            locationName: record.locationName,
            locationType: record.locationType,
            status: record.status,
            address1: record.address1,
            address2: record.address2,
            city: record.city,
            state: record.state,
            zipCode: record.zipCode,
            country: record.country
          }
        };

        // Update the mapping for this record
        if (record.originalFileIndex !== undefined && record.originalRowIndex !== undefined) {
          const mappingKey = `${record.originalFileIndex}-${record.originalRowIndex}`;
          setOriginalRowToCompanyMapping(prev => {
            const updated = new Map(prev);
            updated.set(mappingKey, {
              companyName: standardized.companyName,
              address1: standardized.address1,
              address2: standardized.address2,
              city: standardized.city,
              state: standardized.state,
              zipCode: standardized.zipCode,
              country: standardized.country
            });
            return updated;
          });
        }
      }

      setProcessedData(updatedData);
      
      const recordCount = indices.length;
      showSuccess(
        recordCount === processedData.length 
          ? `Successfully standardized all ${recordCount} records.`
          : `Successfully standardized ${recordCount} record${recordCount !== 1 ? 's' : ''}.`,
        'Standardization Complete'
      );
      
    } catch (error) {
      console.error('Error standardizing records:', error);
      showError('An error occurred while standardizing the records. Please try again.');
    } finally {
      setIsStandardizing(false);
      setStandardizationProgress({ current: 0, total: 0 });
    }
  };

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

  const viewOriginalData = useCallback((record) => {
    setSelectedOriginalRecord(record);
    setShowOriginalModal(true);
  }, []);

  const closeOriginalModal = useCallback(() => {
    setShowOriginalModal(false);
    setSelectedOriginalRecord(null);
  }, []);

  const viewNearDuplicateData = useCallback((record) => {
    setSelectedNearDuplicateRecord(record);
    setShowNearDuplicateModal(true);
  }, []);

  const closeNearDuplicateModal = useCallback(() => {
    setShowNearDuplicateModal(false);
    setSelectedNearDuplicateRecord(null);
  }, []);

  const openFindReplaceModal = useCallback((field, fieldLabel) => {
    setFindReplaceField(field);
    setFindReplaceFieldLabel(fieldLabel);
    setShowFindReplaceModal(true);
  }, []);

  const closeFindReplaceModal = useCallback(() => {
    setShowFindReplaceModal(false);
    setFindReplaceField(null);
    setFindReplaceFieldLabel('');
  }, []);

  const handleFindReplace = useCallback((field, changes) => {
    try {
      setProcessedData(prev => {
        const updated = [...prev];
        changes.forEach(change => {
          if (updated[change.index]) {
            updated[change.index] = {
              ...updated[change.index],
              [field]: change.newValue
            };
          }
        });
        return updated;
      });

      showSuccess(
        `Successfully updated ${changes.length} record${changes.length !== 1 ? 's' : ''} in ${findReplaceFieldLabel}.`,
        'Find & Replace Complete'
      );
    } catch (error) {
      console.error('Error performing find and replace:', error);
      showError('An error occurred while performing the find and replace operation. Please try again.');
    }
  }, [findReplaceFieldLabel, showSuccess, showError]);

  // Export to CSV functionality with Orders and Commissions
const exportToCSV = useCallback(() => {
  try {
    const selectedData = processedData.filter((record, index) => selectedRecords.has(index));
    let finalExportData = [...selectedData];
    
    if (!showMissingAddresses) {
      finalExportData = finalExportData.filter(record => record.address1 && record.city && record.state && record.zipCode);
    }
    if (!showDuplicates) {
      finalExportData = finalExportData.filter(record => !record.isDuplicate || record.isSelectableDuplicate);
    }

    const companyGroups = new Map();
    finalExportData.forEach(record => {
      const companyKey = record.companyName.toLowerCase().trim();
      if (!companyGroups.has(companyKey)) {
        companyGroups.set(companyKey, []);
      }
      companyGroups.get(companyKey).push(record);
    });

    const customerNames = [];
    const customerLocations = [];

    companyGroups.forEach(recordGroup => {
      const sortedRecords = recordGroup.sort((a, b) => {
        const addressA = `${a.address1} ${a.city} ${a.state} ${a.zipCode}`.toLowerCase();
        const addressB = `${b.address1} ${b.city} ${b.state} ${b.zipCode}`.toLowerCase();
        return addressA.localeCompare(addressB);
      });

      if (sortedRecords.length > 0) customerNames.push(sortedRecords[0]);
      if (sortedRecords.length > 1) customerLocations.push(...sortedRecords.slice(1));
    });

    // Customer Names headers and format
    const customerNamesHeaders = ['Partner', 'Customer Parent', 'Customer Name', 'Customer Type(s)', 'Exclusive Supplier(s)',	'Account Manager',	
      'Support Solution',	'Billing Solution', 'Status', 'Name', 'Description', 'Primary Contact',	'Primary Contact Phone',	'Primary Contact Extension',	
      'Primary Contact Email', 'Address One', 'Address Two', 'City', 'State', 'Zip Code', 'Country', 'Tax Identification Number',	
      'Approach Date', 'Lead Source', 'Sub Agent', 'Sub Agent Percentage', 'Ownership', 'Vertical', 'Classification', 'URL', 'Count Employees', 
      'Count Locations'];
    const formatCustomerNameRecord = (record) => [
      '""',
      '""',
      `"Wired"`,
      '""',
      '""',
      '""',
      '""',
      `"Active"`,
      '""',
      `"${record.companyName.replace(/"/g, '""')}"`,
      '""',
      '""',
      '""',
      '""',
      '""',
      `"${record.address1.replace(/"/g, '""')}"`,
      `"${record.address2.replace(/"/g, '""')}"`,
      `"${record.city.replace(/"/g, '""')}"`,
      `"${record.state.replace(/"/g, '""')}"`,
      `"${record.zipCode.replace(/"/g, '""')}"`,
      `"${record.country.replace(/"/g, '""')}"`,
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""'].join(',');

    // Customer Locations headers and format
    const customerLocationsHeaders = ['Customer', 'Location Name', 'Location Type', 'Location Number', 'Status', 'Sub Status', 'Billing Code',
    'Address One', 'Address Two', 'City', 'State', 'Postal Code', 'Country', 'Primary Name', 'Primary Phone', 'Primary Phone Extension', 
    'Primary Email', 'Secondary Name', 'Secondary Phone', 'Secondary Phone Extension', 'Secondary Email'];
    const formatCustomerLocationRecord = (record) => {
      const locationName = `${record.companyName} - ${record.city} ${record.state}`;
      return [
        `"${record.companyName.replace(/"/g, '""')}"`,
        `"${locationName.replace(/"/g, '""')}"`,
        `"Branch Office"`,
        '""',
        `"Active"`,
        '""',
        '""',
        `"${record.address1.replace(/"/g, '""')}"`,
        `"${record.address2.replace(/"/g, '""')}"`,
        `"${record.city.replace(/"/g, '""')}"`,
        `"${record.state.replace(/"/g, '""')}"`,
        `"${record.zipCode.replace(/"/g, '""')}"`,
        `"${record.country.replace(/"/g, '""')}"`,
        '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""'].join(',');
    };

    // Helper function to download CSV
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

    // Create and download Customer Names and Locations files
    const customerNamesContent = [customerNamesHeaders.join(','), ...customerNames.map(formatCustomerNameRecord)].join('\n');
    const customerLocationsContent = [customerLocationsHeaders.join(','), ...customerLocations.map(formatCustomerLocationRecord)].join('\n');

    downloadCSV(customerNamesContent, 'Customer Names.csv');
    if (customerLocations.length > 0) {
      downloadCSV(customerLocationsContent, 'Customer Locations.csv');
    }

    // Create Orders and Commissions files with appended company data
    let ordersCount = 0;
    let commissionsCount = 0;

    files.forEach((file, fileIndex) => {
      const isOrdersFile = file.name.toLowerCase().includes('order');
      const isCommissionsFile = file.name.toLowerCase().includes('commission');
      
      if (!isOrdersFile && !isCommissionsFile) return;

      // Get the updated company data for each row
      const enhancedRows = file.data.map((originalRow, rowIndex) => {
        const mappingKey = `${fileIndex}-${rowIndex}`;
        const companyData = originalRowToCompanyMapping.get(mappingKey);
        
        if (companyData) {
          // Append company data to original row
          return {
            ...originalRow,
            'Company Name': companyData.companyName,
            'Address 1': companyData.address1,
            'Address 2': companyData.address2,
            'City': companyData.city,
            'State': companyData.state,
            'Zip Code': companyData.zipCode,
            'Country': companyData.country
          };
        } else {
          // No company data found, append empty company fields
          return {
            ...originalRow,
            'Company Name': '',
            'Address 1': '',
            'Address 2': '',
            'City': '',
            'State': '',
            'Zip Code': '',
            'Country': ''
          };
        }
      });

      // Create headers including the new company fields
      const enhancedHeaders = [
        ...file.headers,
        'Company Name',
        'Address 1',
        'Address 2',
        'City',
        'State',
        'Zip Code',
        'Country'
      ];

      // Format rows for CSV
      const csvRows = enhancedRows.map(row => {
        return enhancedHeaders.map(header => {
          const value = row[header] || '';
          return `"${String(value).replace(/"/g, '""')}"`;
        }).join(',');
      });

      // Create CSV content
      const csvContent = [
        enhancedHeaders.join(','),
        ...csvRows
      ].join('\n');

      // Download the file
      if (isOrdersFile) {
        downloadCSV(csvContent, 'Orders.csv');
        ordersCount = enhancedRows.length;
      } else if (isCommissionsFile) {
        downloadCSV(csvContent, 'Commissions.csv');
        commissionsCount = enhancedRows.length;
      }
    });

    // Show success message
    let exportMessage = `Downloaded ${customerNames.length} customer names`;
    if (customerLocations.length > 0) {
      exportMessage += ` and ${customerLocations.length} additional locations`;
    }
    if (ordersCount > 0) {
      exportMessage += `, ${ordersCount} orders with company data`;
    }
    if (commissionsCount > 0) {
      exportMessage += `, ${commissionsCount} commissions with company data`;
    }
    exportMessage += '.';

    showSuccess(exportMessage, 'Export Complete');
  } catch (error) {
    console.error('Error exporting data:', error);
    showError('An error occurred while exporting the data. Please try again.');
  }
}, [processedData, selectedRecords, showMissingAddresses, showDuplicates, files, originalRowToCompanyMapping, showSuccess, showError]);

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
    setShowReviewOnly(false);
    setIsStandardizing(false);
    setIsAnalyzing(false);
    setIsRemovingDuplicates(false);
    setWorkflowStep(1);
    setStandardizationProgress({ current: 0, total: 0 });
    setAnalysisProgress({ current: 0, total: 0 });
    setMappingName('');
    setProgressName('');
    setShowOriginalModal(false);
    setSelectedOriginalRecord(null);
    setShowNearDuplicateModal(false);
    setSelectedNearDuplicateRecord(null);
    setShowFindReplaceModal(false);
    setFindReplaceField(null);
    setFindReplaceFieldLabel('');
    setOriginalRowToCompanyMapping(new Map());
    showInfo('Application has been reset. You can now upload new files.', 'Reset Complete');
  }, [showInfo]);

  const toggleReviewFilter = useCallback(() => {
    setShowReviewOnly(prev => !prev);
  }, []);

  // Progress save/load functions
  const exportProgress = useCallback(() => {
    if (!progressName.trim()) {
      showWarning('Please enter a name for the progress save.');
      return;
    }

    if (processedData.length === 0) {
      showWarning('No data to save. Please process files first.');
      return;
    }

    try {
      const progressData = {
        name: progressName.trim(),
        timestamp: new Date().toISOString(),
        version: '1.0',
        processedData: processedData,
        selectedRecords: Array.from(selectedRecords),
        showMissingAddresses: showMissingAddresses,
        showDuplicates: showDuplicates,
        showReviewOnly: showReviewOnly,
        workflowStep: workflowStep,
        files: files.map(file => ({
          name: file.name,
          headers: file.headers,
          recordCount: file.data.length
        })),
        primaryFileIndex: primaryFileIndex,
        columnMappings: columnMappings,
        originalRowToCompanyMapping: Array.from(originalRowToCompanyMapping.entries()),
        stats: {
          totalRecords: processedData.length,
          selectedCount: selectedRecords.size,
          standardizedCount: processedData.filter(r => r.isStandardized).length,
          duplicateCount: processedData.filter(r => r.isDuplicate).length,
          nearDuplicateCount: processedData.filter(r => r.isNearDuplicate).length,
          flaggedCount: processedData.filter(r => r.hasAnalysisIssues).length
        }
      };

      const dataStr = JSON.stringify(progressData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${progressName.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase()}_progress.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showSuccess(`Progress "${progressName}" has been saved successfully! You can reload this data anytime to continue where you left off.`, 'Progress Saved');
    } catch (error) {
      console.error('Error exporting progress:', error);
      showError('An error occurred while saving progress. Please try again.');
    }
  }, [progressName, processedData, selectedRecords, showMissingAddresses, showDuplicates, showReviewOnly, workflowStep, files, primaryFileIndex, columnMappings, originalRowToCompanyMapping, showSuccess, showError, showWarning]);

  const importProgress = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fileContent = await file.text();
      const progressData = JSON.parse(fileContent);

      if (!progressData.name || !progressData.processedData || !Array.isArray(progressData.processedData)) {
        throw new Error('Invalid progress file format');
      }

      setProcessedData(progressData.processedData);
      setSelectedRecords(new Set(progressData.selectedRecords || []));
      setShowMissingAddresses(progressData.showMissingAddresses !== undefined ? progressData.showMissingAddresses : true);
      setShowDuplicates(progressData.showDuplicates !== undefined ? progressData.showDuplicates : true);
      setShowReviewOnly(progressData.showReviewOnly !== undefined ? progressData.showReviewOnly : false);
      setWorkflowStep(progressData.workflowStep || 1);
      setProgressName(progressData.name);
      
      if (progressData.files) {
        const restoredFiles = progressData.files.map(fileInfo => ({
          name: fileInfo.name,
          headers: fileInfo.headers,
          data: []
        }));
        setFiles(restoredFiles);
      }
      
      if (progressData.primaryFileIndex !== undefined) {
        setPrimaryFileIndex(progressData.primaryFileIndex);
      }
      
      if (progressData.columnMappings) {
        setColumnMappings(progressData.columnMappings);
      }

      if (progressData.originalRowToCompanyMapping) {
        setOriginalRowToCompanyMapping(new Map(progressData.originalRowToCompanyMapping));
      }

      setStep(STEPS.RESULTS);

      const stats = progressData.stats;
      const statsText = stats 
        ? ` (${stats.totalRecords} total records, ${stats.selectedCount} selected, ${stats.standardizedCount} standardized, ${stats.flaggedCount || 0} flagged)`
        : '';
      
      showSuccess(`Progress "${progressData.name}" has been loaded successfully!${statsText} You can continue editing and processing from where you left off.`, 'Progress Loaded');
      
    } catch (error) {
      console.error('Error importing progress:', error);
      showError('Error loading progress file. Please check that it is a valid progress file.');
    }

    event.target.value = '';
  }, [showSuccess, showError]);

  // Mapping save/load functions
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
          headers: file.headers
        })),
        columnMappings: columnMappings,
        primaryFileIndex: primaryFileIndex,
        version: '1.0'
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

  return {
    // State
    files, filesWithWorksheets, processedData, columnMappings, primaryFileIndex, showMissingAddresses, showDuplicates, showReviewOnly,
    selectedRecords, editingCell, step, isStandardizing, isAnalyzing, isRemovingDuplicates, standardizationProgress, analysisProgress, mappingName, progressName,
    showOriginalModal, selectedOriginalRecord, showNearDuplicateModal, selectedNearDuplicateRecord,
    showFindReplaceModal, findReplaceField, findReplaceFieldLabel, notifications, workflowStep, workflowButtons,
    setShowMissingAddresses, setShowDuplicates, setPrimaryFileIndex, setMappingName, setProgressName, removeNotification,
    
    // Actions
    handleFileUpload, handleWorksheetSelection, handleContinueFromWorksheetSelection, updateColumnMapping, processFiles, exportToCSV, resetAll, exportMapping, importMapping, exportProgress, importProgress,
    viewOriginalData, closeOriginalModal, viewNearDuplicateData, closeNearDuplicateModal, openFindReplaceModal, closeFindReplaceModal, handleFindReplace, analyzeRecords, toggleReviewFilter,
    removeDuplicates, standardizeRemainingRecords,
    toggleRecordSelection, toggleSelectAll, handleCellEdit, handleCellClick, handleCellBlur, removeNotification,
    
    // Computed
    filteredData, selectedCount
  };
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const CustomerExtractor = () => {
  const {
    // State
    files, filesWithWorksheets, processedData, columnMappings, primaryFileIndex, showMissingAddresses, showDuplicates, showReviewOnly,
    selectedRecords, editingCell, step, isStandardizing, isAnalyzing, isRemovingDuplicates, standardizationProgress, analysisProgress, mappingName, progressName,
    showOriginalModal, selectedOriginalRecord, showNearDuplicateModal, selectedNearDuplicateRecord,
    showFindReplaceModal, findReplaceField, findReplaceFieldLabel, notifications, workflowStep, workflowButtons,
    
    // Actions
    handleFileUpload, handleWorksheetSelection, handleContinueFromWorksheetSelection, updateColumnMapping, setPrimaryFileIndex, setShowMissingAddresses, setShowDuplicates, setMappingName, setProgressName,
    toggleRecordSelection, toggleSelectAll, handleCellEdit, handleCellClick, handleCellBlur, processFiles, exportToCSV, resetAll, exportMapping, importMapping, exportProgress, importProgress,
    viewOriginalData, closeOriginalModal, viewNearDuplicateData, closeNearDuplicateModal, openFindReplaceModal, closeFindReplaceModal, handleFindReplace, analyzeRecords, toggleReviewFilter, removeNotification,
    removeDuplicates, standardizeRemainingRecords,
    
    // Computed
    filteredData, selectedCount
  } = useCustomerExtractor();

  return (
    <div className="w-full min-h-screen bg-gray-50 p-2 md:p-4 lg:p-6">
      <SnackbarContainer notifications={notifications} onRemove={removeNotification} />
      
      <div className="bg-white rounded-lg shadow-lg p-3 md:p-4 lg:p-6 w-full">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="text-blue-600" />
            ForgeOS - Onboarding
          </h1>
        </header>

        <StepIndicator currentStep={step} />

        {isStandardizing && (
          <ProgressIndicator 
            current={standardizationProgress.current}
            total={standardizationProgress.total}
            label="Standardizing Records..."
          />
        )}

        {isAnalyzing && (
          <ProgressIndicator 
            current={analysisProgress.current}
            total={analysisProgress.total}
            label="Analyzing Records..."
          />
        )}

        {isRemovingDuplicates && (
          <ProgressIndicator 
            current={analysisProgress.current}
            total={analysisProgress.total}
            label="Removing Duplicates..."
          />
        )}

        {step === STEPS.UPLOAD && (
          <FileUploadStep onFileUpload={handleFileUpload} onImportProgress={importProgress} />
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
            onProcessFiles={processFiles}
            onSetMappingName={setMappingName}
            onExportMapping={exportMapping}
            onImportMapping={importMapping}
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
            showReviewOnly={showReviewOnly}
            editingCell={editingCell}
            isStandardizing={isStandardizing}
            isAnalyzing={isAnalyzing}
            files={files}
            primaryFileIndex={primaryFileIndex}
            progressName={progressName}
            workflowButtons={workflowButtons}
            workflowStep={workflowStep}
            onToggleRecordSelection={toggleRecordSelection}
            onToggleSelectAll={toggleSelectAll}
            onCellEdit={handleCellEdit}
            onCellClick={handleCellClick}
            onCellBlur={handleCellBlur}
            onToggleMissingAddresses={() => setShowMissingAddresses(!showMissingAddresses)}
            onToggleDuplicates={() => setShowDuplicates(!showDuplicates)}
            onToggleReviewFilter={toggleReviewFilter}
            onAnalyzeRecords={analyzeRecords}
            onRemoveDuplicates={removeDuplicates}
            onStandardizeRemaining={standardizeRemainingRecords}
            onExport={exportToCSV}
            onReset={resetAll}
            onViewOriginalData={viewOriginalData}
            onViewNearDuplicateData={viewNearDuplicateData}
            onOpenFindReplace={openFindReplaceModal}
            onSetProgressName={setProgressName}
            onExportProgress={exportProgress}
            onImportProgress={importProgress}
          />
        )}
      </div>

      <OriginalDataModal
        isOpen={showOriginalModal}
        record={selectedOriginalRecord}
        onClose={closeOriginalModal}
      />

      <NearDuplicateModal
        isOpen={showNearDuplicateModal}
        record={selectedNearDuplicateRecord}
        onClose={closeNearDuplicateModal}
      />

      <FindReplaceModal
        isOpen={showFindReplaceModal}
        field={findReplaceField}
        fieldLabel={findReplaceFieldLabel}
        data={processedData}
        onClose={closeFindReplaceModal}
        onReplace={handleFindReplace}
      />
    </div>
  );
};

export default CustomerExtractor;