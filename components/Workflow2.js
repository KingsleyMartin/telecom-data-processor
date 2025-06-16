"use client";

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Upload, Download, FileText, Users, MapPin, AlertCircle, CheckCircle, X, ArrowRight, Search, ChevronLeft, Check, AlertTriangle, Eye, Trash2, RefreshCw, Settings, Zap, Database } from 'lucide-react';
import * as XLSX from 'xlsx';

// ===== SERVICES =====

class AddressCache {
  constructor(maxSize = 5000, ttl = 24 * 60 * 60 * 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.hits = 0;
    this.misses = 0;
  }

  generateKey(addressInput) {
    const normalized = typeof addressInput === 'string' 
      ? addressInput 
      : `${addressInput.address1}_${addressInput.address2}_${addressInput.city}_${addressInput.state}_${addressInput.zipCode}`;
    
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `addr_${Math.abs(hash)}`;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      this.misses++;
      return null;
    }
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    
    this.hits++;
    return item.data;
  }

  set(key, data) {
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  cleanup() {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    
    entries.forEach(([key, value]) => {
      if (now - value.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    });
    
    if (this.cache.size >= this.maxSize) {
      const sortedEntries = entries
        .filter(([key]) => this.cache.has(key))
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = Math.ceil(this.maxSize * 0.2);
      for (let i = 0; i < toRemove && i < sortedEntries.length; i++) {
        this.cache.delete(sortedEntries[i][0]);
      }
    }
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      usage: (this.cache.size / this.maxSize * 100).toFixed(1) + '%',
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(1) + '%' : '0%',
      hits: this.hits,
      misses: this.misses
    };
  }
}

const addressCache = new AddressCache();

const apiService = {
  async callGeminiWithRetry(prompt, apiKey, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, apiKey })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          if (response.status === 429 || response.status === 401 || response.status === 403) {
            throw new Error(errorData.error || `HTTP ${response.status}`);
          }
          
          if (attempt === maxRetries) {
            throw new Error(errorData.error || `HTTP ${response.status}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }

        const data = await response.json();
        if (!data.text) {
          throw new Error('Invalid response from API');
        }

        return data.text;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }
};

const addressService = {
  async cleanWithAI(addressInput, apiKey) {
    const cacheKey = addressCache.generateKey(addressInput);
    const cached = addressCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    let prompt;
    if (typeof addressInput === 'string') {
      prompt = `Parse and standardize this address. Return ONLY valid JSON:

Input: "${addressInput}"

Rules:
1. Break the single-line address into separate fields: "Address 1", "Address 2", "City", "State", and "Zip Code".
2. Convert all fields to proper title case (first letter of each word capitalized), except for the State which should be a 2-letter uppercase code.
3. Standardize street suffixes (St -> Street, Ave -> Avenue, Rd -> Road, Dr -> Drive, Blvd -> Boulevard, Ln -> Lane, Ct -> Court).
4. Identify and place any suite, unit, apartment, or floor information into the "Address 2" field.
5. Clean and format city names properly.
6. Keep the zip code as-is but remove any invalid characters.

Return format (valid JSON only):
{
  "Address 1": "cleaned primary address",
  "Address 2": "suite/unit info if any", 
  "City": "cleaned city",
  "State": "XX",
  "Zip Code": "zipcode"
}`;
    } else {
      const { address1, address2, city, state, zipCode } = addressInput;
      prompt = `Clean and standardize this address. Return ONLY valid JSON:

Input:
- Address 1: "${address1 || ''}"
- Address 2: "${address2 || ''}"
- City: "${city || ''}"
- State: "${state || ''}"
- Zip Code: "${zipCode || ''}"

Rules:
1. Convert all fields to proper title case (first letter of each word capitalized), except for the State which should be a 2-letter uppercase code.
2. Standardize street suffixes (St -> Street, Ave -> Avenue, Rd -> Road, Dr -> Drive, Blvd -> Boulevard, Ln -> Lane, Ct -> Court) in "Address 1".
3. If "Address 1" contains suite/unit/apartment/building info, extract it and place it in "Address 2". If "Address 2" already has a value, merge them intelligently.
4. Clean and format city names properly.
5. Ensure state is a 2-letter uppercase code.
6. Keep the zip code as-is but remove any invalid characters.

Return format (valid JSON only):
{
  "Address 1": "cleaned address",
  "Address 2": "suite/unit info if any",
  "City": "cleaned city", 
  "State": "XX",
  "Zip Code": "zipcode"
}`;
    }

    try {
      const response = await apiService.callGeminiWithRetry(prompt, apiKey);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in AI response');
      }

      const cleanedData = JSON.parse(jsonMatch[0]);
      const expectedFields = ['Address 1', 'Address 2', 'City', 'State', 'Zip Code'];
      const hasAllFields = expectedFields.every(field => cleanedData.hasOwnProperty(field));

      if (!hasAllFields) {
        throw new Error('AI response missing required fields');
      }

      addressCache.set(cacheKey, cleanedData);
      return cleanedData;
    } catch (error) {
      console.warn('AI cleaning failed, falling back to basic cleaning:', error);
      const basicResult = this.basicClean(addressInput);
      addressCache.set(cacheKey, basicResult);
      return basicResult;
    }
  },

  basicClean(addressInput) {
    const address1 = typeof addressInput === 'object' ? addressInput.address1 : addressInput;
    const address2 = typeof addressInput === 'object' ? addressInput.address2 : '';
    const city = typeof addressInput === 'object' ? addressInput.city : '';
    const state = typeof addressInput === 'object' ? addressInput.state : '';
    const zipCode = typeof addressInput === 'object' ? addressInput.zipCode : '';

    let cleanAddress1 = address1 ? address1.replace(/\b(st|ave|rd|dr|blvd|ln|way|ct)\b/gi, match => {
      const replacements = {
        'st': 'Street', 'ave': 'Avenue', 'rd': 'Road', 'dr': 'Drive',
        'blvd': 'Boulevard', 'ln': 'Lane', 'way': 'Way', 'ct': 'Court'
      };
      return replacements[match.toLowerCase()] || match;
    }).replace(/\b\w/g, l => l.toUpperCase()) : '';

    const cleanCity = city ? city.replace(/\b\w/g, l => l.toUpperCase()) : '';
    const cleanState = state ? state.toUpperCase() : '';

    let cleanAddress2 = address2 || '';
    const suiteMatch = cleanAddress1.match(/(suite|ste|unit|apt|apartment|floor|fl|room|rm)\s*[\#\-\s]*(\w+)/i);
    if (suiteMatch && !cleanAddress2) {
      cleanAddress2 = `${suiteMatch[1].replace(/\b\w/g, l => l.toUpperCase())} ${suiteMatch[2]}`;
      cleanAddress1 = cleanAddress1.replace(suiteMatch[0], '').trim();
    }

    return {
      'Address 1': cleanAddress1,
      'Address 2': cleanAddress2,
      'City': cleanCity,
      'State': cleanState,
      'Zip Code': zipCode
    };
  }
};

const dataService = {
  cleanText(text) {
    if (!text || text === null || text === undefined) return '';
    return String(text).trim();
  },

  arrayToCSV(data) {
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
  },

  downloadCSV(data, filename) {
    const csvContent = this.arrayToCSV(data);
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
  }
};

// ===== HOOKS =====

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
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
    
    if (jsonData.length === 0) return { data: [], headers: [] };
    
    const headers = jsonData[0].map(h => String(h).trim());
    const maxRows = fullParse ? jsonData.length : Math.min(jsonData.length, 11);
    const data = [];
    
    for (let i = 1; i < maxRows; i++) {
      const row = jsonData[i];
      if (row && row.length === headers.length) {
        const rowData = {};
        headers.forEach((header, index) => {
          rowData[header] = row[index] !== undefined ? String(row[index]).trim() : '';
        });
        data.push(rowData);
      }
    }

    return { data, headers };
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

const useDuplicateDetection = () => {
  const normalizeForDuplicateDetection = useCallback((str) => {
    return str.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  const levenshteinDistance = useCallback((str1, str2) => {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j - 1] + 1,
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1
          );
        }
      }
    }
    return dp[m][n];
  }, []);

  const calculateSimilarity = useCallback((str1, str2) => {
    const normalized1 = normalizeForDuplicateDetection(str1);
    const normalized2 = normalizeForDuplicateDetection(str2);
    const maxLength = Math.max(normalized1.length, normalized2.length);
    if (maxLength === 0) return 1;
    const distance = levenshteinDistance(normalized1, normalized2);
    return 1 - (distance / maxLength);
  }, [normalizeForDuplicateDetection, levenshteinDistance]);

  const validateCustomerNameMatch = useCallback((name1, name2) => {
    if (!name1 || !name2) return false;

    const clean1 = name1.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\b(inc|llc|corp|corporation|company|co|ltd|limited|co\.|inc\.|llc\.)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    const clean2 = name2.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\b(inc|llc|corp|corporation|company|co|ltd|limited|co\.|inc\.|llc\.)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const words1 = clean1.split(/\s+/).filter(w => w.length > 2);
    const words2 = clean2.split(/\s+/).filter(w => w.length > 2);

    if (words1.length <= 1 || words2.length <= 1) {
      return clean1 === clean2;
    }

    const matchingWords = words1.filter(word => words2.includes(word));
    const overlapRatio = matchingWords.length / Math.max(words1.length, words2.length);
    const similarity = calculateSimilarity(clean1, clean2);

    return overlapRatio >= 0.75 && similarity >= 0.85;
  }, [calculateSimilarity]);

  const validateAddressMatch = useCallback((addr1, addr2, threshold) => {
    if (!addr1 || !addr2) return false;

    const clean1 = addr1.toLowerCase()
      .replace(/\b(suite|ste|unit|apt|floor|fl|#)\b/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const clean2 = addr2.toLowerCase()
      .replace(/\b(suite|ste|unit|apt|floor|fl|#)\b/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const similarity = calculateSimilarity(clean1, clean2);
    return similarity >= threshold;
  }, [calculateSimilarity]);

  const generateDeterministicId = useCallback((items, type) => {
    const uniqueString = items.map(item => {
      const { 'Customer Name': name, 'Address 1': addr1, 'City': city, 'State': state, 'Zip Code': zip } = item.item;
      return `${name || ''}_${addr1 || ''}_${city || ''}_${state || ''}_${zip || ''}_${item.index}`;
    }).sort().join('|');
    
    let hash = 0;
    for (let i = 0; i < uniqueString.length; i++) {
      const char = uniqueString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return `${type}_${Math.abs(hash)}_${items[0].index}`;
  }, []);

  const detectDuplicates = useCallback((data, keyField, threshold = 0.8) => {
    const duplicateGroups = [];
    const processed = new Set();

    for (let i = 0; i < data.length; i++) {
      if (processed.has(i)) continue;

      const currentItem = data[i];
      const currentName = currentItem['Customer Name'];
      const currentAddr = currentItem['Address 1'];

      if (!currentName || !currentAddr) continue;

      const similarItems = [{ index: i, item: currentItem, similarity: 1 }];

      for (let j = i + 1; j < data.length; j++) {
        if (processed.has(j)) continue;

        const compareItem = data[j];
        const compareName = compareItem['Customer Name'];
        const compareAddr = compareItem['Address 1'];

        if (!compareName || !compareAddr) continue;

        if (!validateCustomerNameMatch(currentName, compareName)) {
          continue;
        }

        if (validateAddressMatch(currentAddr, compareAddr, threshold)) {
          const addressSimilarity = calculateSimilarity(currentAddr, compareAddr);
          similarItems.push({
            index: j,
            item: compareItem,
            similarity: addressSimilarity,
            details: {
              nameSimilarity: 100,
              addressSimilarity: Math.round(addressSimilarity * 100)
            }
          });
          processed.add(j);
        }
      }

      if (similarItems.length > 1) {
        duplicateGroups.push({
          id: generateDeterministicId(similarItems, keyField),
          items: similarItems.sort((a, b) => b.similarity - a.similarity),
          type: keyField,
          resolved: false
        });
      }

      processed.add(i);
    }

    return duplicateGroups;
  }, [validateCustomerNameMatch, validateAddressMatch, calculateSimilarity, generateDeterministicId]);

  return { detectDuplicates };
};

const useDataExtraction = () => {
  const autoSelectColumns = useCallback((headers, prefix) => {
    const customerPatterns = ['customer', 'client', 'company', 'business'];
    const addressPatterns = ['address', 'location', 'site', 'street'];
    const address2Patterns = ['address 2', 'suite', 'unit', 'apt', 'floor'];
    const cityPatterns = ['city'];
    const statePatterns = ['state', 'province'];
    const zipPatterns = ['zip', 'postal', 'code'];

    const selected = [];

    const findColumn = (patterns) => 
      headers.find(h => patterns.some(p => h.toLowerCase().includes(p)));

    const customerCol = findColumn(customerPatterns);
    if (customerCol) selected.push(customerCol);

    const addressCol = headers.find(h =>
      addressPatterns.some(p => h.toLowerCase().includes(p)) &&
      !address2Patterns.some(p => h.toLowerCase().includes(p))
    );
    if (addressCol) selected.push(addressCol);

    const address2Col = findColumn(address2Patterns);
    if (address2Col) selected.push(address2Col);

    const cityCol = findColumn(cityPatterns);
    if (cityCol) selected.push(cityCol);

    const stateCol = findColumn(statePatterns);
    if (stateCol) selected.push(stateCol);

    const zipCol = findColumn(zipPatterns);
    if (zipCol) selected.push(zipCol);

    return selected;
  }, []);

  const extractCompanyData = useCallback((ordersData, commissionsData, ordersColumns, commissionsColumns) => {
    const customers = new Map();
    const locations = new Map();

    const processData = (data, columns, source) => {
      data.forEach(row => {
        let customerName = '';
        for (const col of columns) {
          if (row[col] && ['customer', 'client', 'company', 'business'].some(p =>
            col.toLowerCase().includes(p))) {
            customerName = dataService.cleanText(row[col]);
            break;
          }
        }

        if (!customerName) return;

        let address1 = '', address2 = '', city = '', state = '', zipCode = '';

        for (const col of columns) {
          const colLower = col.toLowerCase();
          const value = dataService.cleanText(row[col]);

          if (!value) continue;

          if ((colLower.includes('address') && colLower.includes('1')) ||
            (colLower.includes('address') && !colLower.includes('2')) ||
            colLower.includes('location') ||
            colLower.includes('street')) {
            if (!address1) address1 = value;
          } else if ((colLower.includes('address') && colLower.includes('2')) ||
            colLower.includes('suite') ||
            colLower.includes('unit') ||
            colLower.includes('apt') ||
            colLower.includes('floor')) {
            address2 = value;
          } else if (colLower.includes('city')) {
            city = value;
          } else if (colLower.includes('state') || colLower.includes('province')) {
            state = value;
          } else if (colLower.includes('zip') || colLower.includes('postal')) {
            zipCode = value;
          }
        }

        // Parse combined address for commissions data
        if (address1 && !city && !state && !zipCode && source === 'Commissions') {
          const addressParts = address1.split(',').map(part => part.trim());
          if (addressParts.length >= 3) {
            const lastPart = addressParts[addressParts.length - 1];
            const stateZipMatch = lastPart.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
            if (stateZipMatch) {
              state = stateZipMatch[1];
              zipCode = stateZipMatch[2];
              city = addressParts[addressParts.length - 2];
              address1 = addressParts.slice(0, -2).join(', ');
            }
          }

          if (!zipCode) {
            const zipMatch = address1.match(/\b(\d{5}(?:-\d{4})?)\s*$/);
            if (zipMatch) {
              zipCode = zipMatch[1];
              const beforeZip = address1.substring(0, address1.lastIndexOf(zipCode)).trim();

              const stateMatch = beforeZip.match(/\b([A-Z]{2})\s*$/);
              if (stateMatch) {
                state = stateMatch[1];
                const beforeState = beforeZip.substring(0, beforeZip.lastIndexOf(state)).trim();

                const parts = beforeState.split(',').map(p => p.trim()).filter(p => p);
                if (parts.length >= 2) {
                  city = parts[parts.length - 1];
                  address1 = parts.slice(0, -1).join(', ');
                }
              }
            }
          }
        }

        if (customerName && address1) {
          const customerKey = customerName.toUpperCase();
          const locationKey = `${customerKey}_${address1.toUpperCase()}_${city.toUpperCase()}_${state.toUpperCase()}_${zipCode.toUpperCase()}`;

          if (source === 'Orders' || !customers.has(customerKey)) {
            customers.set(customerKey, {
              'Customer Name': customerName,
              'Address 1': address1,
              'Address 2': address2,
              'City': city,
              'State': state,
              'Zip Code': zipCode,
              Source: source,
              includeInExport: true
            });
          }

          const existingLocation = locations.get(locationKey);
          let shouldUpdateLocation = false;

          if (!existingLocation) {
            shouldUpdateLocation = true;
          } else if (source === 'Orders') {
            shouldUpdateLocation = true;
          } else if (source === 'Commissions' && existingLocation.Source === 'Commissions') {
            const hasMoreCompleteData = (!existingLocation['Address 2'] && address2) ||
              (!existingLocation['City'] && city) ||
              (!existingLocation['State'] && state) ||
              (!existingLocation['Zip Code'] && zipCode);
            shouldUpdateLocation = hasMoreCompleteData;
          }

          if (shouldUpdateLocation) {
            locations.set(locationKey, {
              'Customer Name': customerName,
              'Address 1': address1,
              'Address 2': address2,
              'City': city,
              'State': state,
              'Zip Code': zipCode,
              Source: source,
              includeInExport: source === 'Orders'
            });
          }
        }
      });
    };

    if (ordersData.length > 0 && ordersColumns.length > 0) {
      processData(ordersData, ordersColumns, 'Orders');
    }

    if (commissionsData.length > 0 && commissionsColumns.length > 0) {
      processData(commissionsData, commissionsColumns, 'Commissions');
    }

    return {
      customers: Array.from(customers.values()),
      locations: Array.from(locations.values())
    };
  }, []);

  return { autoSelectColumns, extractCompanyData };
};

// ===== COMPONENTS =====

const FileUploadCard = React.memo(({ title, description, file, onFileUpload, headers, previewData, fullData, processing, required }) => (
  <div className="bg-white rounded-lg shadow-sm border p-6">
    <h2 className="text-2xl font-semibold text-gray-800 mb-4">
      {title}
      {required && <span className="text-red-500 ml-1">*</span>}
    </h2>
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
));

const ColumnSelector = React.memo(({ title, headers, selectedColumns, onSelectionChange }) => (
  <div className="bg-white rounded-lg shadow-sm border p-6">
    <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {headers.map((header) => (
        <label key={header} className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selectedColumns.includes(header)}
            onChange={(e) => {
              if (e.target.checked) {
                onSelectionChange([...selectedColumns, header]);
              } else {
                onSelectionChange(selectedColumns.filter(col => col !== header));
              }
            }}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700 truncate">{header}</span>
        </label>
      ))}
    </div>
  </div>
));

const ProgressSteps = React.memo(({ currentStep }) => (
  <div className="mb-8 flex items-center justify-center">
    <div className="flex items-center space-x-4">
      <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${currentStep >= 1 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'}`}>
        <Upload className="w-5 h-5" />
        <span className="font-medium">1. Upload & Configure</span>
      </div>
      <ArrowRight className="w-5 h-5 text-gray-400" />
      <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${currentStep >= 2 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'}`}>
        <Users className="w-5 h-5" />
        <span className="font-medium">2. Review Duplicates</span>
      </div>
      <ArrowRight className="w-5 h-5 text-gray-400" />
      <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${currentStep >= 3 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
        <Download className="w-5 h-5" />
        <span className="font-medium">3. Export Results</span>
      </div>
    </div>
  </div>
));

const ErrorAlert = ({ error }) => error && (
  <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
    <div className="flex items-center">
      <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
      <span className="text-red-700">{error}</span>
    </div>
  </div>
);

const SuccessAlert = ({ message }) => message && (
  <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
    <div className="flex items-center">
      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
      <span className="text-green-700">{message}</span>
    </div>
  </div>
);

const DuplicateGroup = React.memo(({ group, onResolve }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isResolved, setIsResolved] = useState(group.resolved || false);

  const handleResolve = useCallback(() => {
    const selectedItem = group.items[selectedIndex];
    const otherItems = group.items.filter((_, index) => index !== selectedIndex);

    onResolve(group.id, selectedItem, otherItems);
    setIsResolved(true);
  }, [group.id, group.items, selectedIndex, onResolve]);

  const handleSelectItem = useCallback((index) => {
    if (!isResolved) {
      setSelectedIndex(index);
    }
  }, [isResolved]);

  return (
    <div className={`border rounded-lg p-4 ${isResolved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
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
          <button
            onClick={handleResolve}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <Check className="w-3 h-3" />
            Keep Selected
          </button>
        )}
      </div>

      {!isResolved && (
        <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
          <strong>Instructions:</strong> Click on a record to select it as the one to keep. The selected record will be preserved, and duplicates will be marked for removal.
        </div>
      )}

      <div className="space-y-2">
        {group.items.map((item, index) => (
          <div
            key={index}
            className={`flex items-center justify-between p-3 rounded border cursor-pointer transition-colors ${isResolved
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
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedIndex === index
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
                <p className="font-medium">{item.item['Customer Name']}</p>
                <p className="text-sm text-gray-600">{item.item['Address 1']}</p>
                <p className="text-sm text-gray-500">{item.item.City}, {item.item.State} {item.item['Zip Code']}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-medium text-blue-600">
                {Math.round(item.similarity * 100)}% match
              </span>
              {isResolved && selectedIndex !== index && (
                <div className="text-xs text-red-600 mt-1">
                  <Trash2 className="w-3 h-3 inline mr-1" />
                  Will be removed
                </div>
              )}
              {isResolved && selectedIndex === index && (
                <div className="text-xs text-green-600 mt-1">
                  <CheckCircle className="w-3 h-3 inline mr-1" />
                  Will be kept
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

const DuplicateDetectionPanel = React.memo(({
  duplicates,
  onResolveDuplicate,
  duplicateThreshold,
  onThresholdChange
}) => {
  const totalGroups = duplicates.customers.length + duplicates.locations.length;

  return (
    <div className="mb-6 bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-800">Duplicate Detection & Resolution</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-700">Similarity Threshold:</label>
          <select
            value={duplicateThreshold}
            onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
            className="px-3 py-1 text-sm border border-gray-300 rounded"
          >
            <option value={0.7}>70% - Loose matching</option>
            <option value={0.8}>80% - Balanced</option>
            <option value={0.9}>90% - Strict matching</option>
            <option value={0.95}>95% - Very strict</option>
          </select>
        </div>
      </div>

      {totalGroups === 0 ? (
        <div className="text-center py-8">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Duplicates Found</h3>
          <p className="text-gray-600">All records appear to be unique at the current threshold.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {duplicates.customers.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Customer Duplicates ({duplicates.customers.length} groups)
              </h3>
              <div className="space-y-4">
                {duplicates.customers.map(group => (
                  <DuplicateGroup
                    key={group.id}
                    group={group}
                    onResolve={onResolveDuplicate}
                  />
                ))}
              </div>
            </div>
          )}
          {duplicates.locations.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Location Duplicates ({duplicates.locations.length} groups)
              </h3>
              <div className="space-y-4">
                {duplicates.locations.map(group => (
                  <DuplicateGroup
                    key={group.id}
                    group={group}
                    onResolve={onResolveDuplicate}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const EditableDataTable = React.memo(({
  data,
  dataType,
  editingCell,
  editValue,
  onCellClick,
  onCellSave,
  onEditValueChange,
  onKeyPress,
  refreshKey,
  onExportSelectionChange
}) => {
  const fields = ['Customer Name', 'Address 1', 'Address 2', 'City', 'State', 'Zip Code'];
  const requiredFields = fields.filter(field => field !== 'Address 2');

  // Add helper functions for value checking
  const isNull = useCallback((value) => {
    return value === null || 
           value === undefined || 
           value === 'null' || 
           value === 'undefined';
  }, []);

  const isEmpty = useCallback((value) => {
    return String(value || '').trim() === '';
  }, []);

  const isFieldEmpty = useCallback((field, value) => {
    // Don't mark Address 2 as empty since it's optional
    if (field === 'Address 2') return false;
    return isNull(value) || isEmpty(value);
  }, [isNull, isEmpty]);

  // Calculate missing fields count
  const missingFieldsCount = useMemo(() => {
    return data.reduce((count, item) => {
      return count + requiredFields.reduce((fieldCount, field) => {
        if (isFieldEmpty(field, item[field])) {
          return fieldCount + 1;
        }
        return fieldCount;
      }, 0);
    }, 0);
  }, [data, requiredFields, isFieldEmpty]);

  return (
    <div className="space-y-4">
      <div className={`border rounded p-3 ${
        missingFieldsCount > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'
      }`}>
        <p className={`text-sm ${
          missingFieldsCount > 0 ? 'text-yellow-800' : 'text-green-800'
        }`}>
          {missingFieldsCount > 0 
            ? `${missingFieldsCount} required fields need attention` 
            : 'All required fields are filled'}
        </p>
      </div>
      <div className="overflow-x-auto" key={refreshKey}>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Export
              </th>
              {fields.map((field) => (
                <th
                  key={field}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((item, rowIndex) => (
              <tr
                key={`${dataType}-${rowIndex}-${refreshKey}`}
                className={`${
                  item.Source === 'Commissions' ? 'bg-yellow-50' : ''
                } hover:bg-gray-50`}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={item.includeInExport ?? (item.Source !== 'Commissions')}
                    onChange={(e) => onExportSelectionChange(dataType, rowIndex, e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                </td>
                {fields.map((field) => {
                  const cellKey = `${dataType}-${rowIndex}-${field}`;
                  const isEditing = editingCell === cellKey;
                  const value = item[field];
                  const isEmpty = isFieldEmpty(field, value);

                  return (
                    <td
                      key={field}
                      className={`px-6 py-4 whitespace-nowrap text-sm ${
                        isEmpty ? 'bg-red-50 border border-red-200' : ''
                      }`}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => onEditValueChange(e.target.value)}
                          onBlur={() => onCellSave(dataType, rowIndex, field)}
                          onKeyDown={(e) => onKeyPress(e, dataType, rowIndex, field)}
                          className="w-full px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          autoFocus
                        />
                      ) : (
                        <div
                          onClick={() => onCellClick(dataType, rowIndex, field, value)}
                          className={`cursor-pointer min-h-[24px] px-2 py-1 rounded hover:bg-gray-100 ${
                            isEmpty ? 'text-red-500 italic' : 
                            isNull ? 'text-gray-500 italic' : 'text-gray-900'
                          }`}
                        >
                          {isEmpty ? 'Click to add...' : 
                           isNull ? 'Click to edit...' : 
                           String(value)}
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
    </div>
  );
});

const CacheStatsCard = React.memo(({ onClearCache }) => {
  const [stats, setStats] = useState(addressCache.getStats());

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(addressCache.getStats());
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-600" />
          Cache Performance
        </h3>
        <button
          onClick={() => {
            addressCache.clear();
            setStats(addressCache.getStats());
            onClearCache && onClearCache();
          }}
          className="text-sm px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
        >
          Clear Cache
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-gray-500">Entries</div>
          <div className="font-semibold">{stats.size.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-gray-500">Usage</div>
          <div className="font-semibold">{stats.usage}</div>
        </div>
        <div>
          <div className="text-gray-500">Hit Rate</div>
          <div className="font-semibold text-green-600">{stats.hitRate}</div>
        </div>
        <div>
          <div className="text-gray-500">Total Hits</div>
          <div className="font-semibold">{stats.hits.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
});

// ===== MAIN COMPONENT =====

const WorkflowApp = () => {
  const { parseFile } = useFileParser();
  const { detectDuplicates } = useDuplicateDetection();
  const { autoSelectColumns, extractCompanyData } = useDataExtraction();

  // Main state
  const [currentStep, setCurrentStep] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // File states
  const [ordersFile, setOrdersFile] = useState(null);
  const [commissionsFile, setCommissionsFile] = useState(null);
  const [ordersData, setOrdersData] = useState({ headers: [], data: [] });
  const [commissionsData, setCommissionsData] = useState({ headers: [], data: [] });
  const [fullOrdersData, setFullOrdersData] = useState({ headers: [], data: [] });
  const [fullCommissionsData, setFullCommissionsData] = useState({ headers: [], data: [] });

  // Column selection
  const [selectedOrdersColumns, setSelectedOrdersColumns] = useState([]);
  const [selectedCommissionsColumns, setSelectedCommissionsColumns] = useState([]);

  // Results states
  const [duplicates, setDuplicates] = useState({ customers: [], locations: [] });
  const [removedItems] = useState(new Set());
  const [extractedData, setExtractedData] = useState({ customers: [], locations: [] });
  const [resolvedDuplicates, setResolvedDuplicates] = useState(new Map());
  const [duplicateThreshold, setDuplicateThreshold] = useState(0.8);

  // Editing states for export tables
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('customers');

  // AI cleaning states
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [isCleaningData, setIsCleaningData] = useState(false);
  const [cleaningProgress, setCleaningProgress] = useState({ current: 0, total: 0 });
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  // Force refresh key for table updates
  const [refreshKey, setRefreshKey] = useState(0);

  // Memoized calculations
  const totalDuplicateGroups = useMemo(() =>
    duplicates.customers.length + duplicates.locations.length,
    [duplicates.customers.length, duplicates.locations.length]
  );

  const unresolvedDuplicateGroups = useMemo(() =>
    duplicates.customers.filter(g => !g.resolved).length +
    duplicates.locations.filter(g => !g.resolved).length,
    [duplicates.customers, duplicates.locations]
  );

  // Analyze duplicates
  const analyzeDuplicates = useCallback(() => {
    if (!extractedData.customers.length && !extractedData.locations.length) return;

    const { customerDuplicates, locationDuplicates } = detectDuplicates(
      extractedData.customers,
      extractedData.locations,
      duplicateThreshold
    );

    setDuplicates({
      customers: customerDuplicates,
      locations: locationDuplicates
    });
  }, [extractedData, duplicateThreshold, detectDuplicates]);

  const handleThresholdChange = useCallback((newThreshold) => {
    setDuplicateThreshold(newThreshold);
    if (extractedData.customers.length > 0 || extractedData.locations.length > 0) {
      analyzeDuplicates(extractedData.customers, extractedData.locations);
    }
  }, [analyzeDuplicates, extractedData]);

  // File upload handlers
  const handleOrdersFileUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setProcessing(true);
    setError('');

    try {
      const sampleParsed = await parseFile(file, false);
      const fullParsed = await parseFile(file, true);

      setOrdersFile(file);
      setOrdersData(sampleParsed);
      setFullOrdersData(fullParsed);

      const selectedCols = autoSelectColumns(sampleParsed.headers, 'orders');
      setSelectedOrdersColumns(selectedCols);
    } catch (err) {
      setError(`Error processing orders file: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }, [parseFile, autoSelectColumns]);

  const handleCommissionsFileUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setProcessing(true);
    setError('');

    try {
      const sampleParsed = await parseFile(file, false);
      const fullParsed = await parseFile(file, true);

      setCommissionsFile(file);
      setCommissionsData(sampleParsed);
      setFullCommissionsData(fullParsed);

      const selectedCols = autoSelectColumns(sampleParsed.headers, 'commissions');
      setSelectedCommissionsColumns(selectedCols);
    } catch (err) {
      setError(`Error processing commissions file: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }, [parseFile, autoSelectColumns]);

  // Process step 1
  const processStep1 = useCallback(async () => {
    if (!ordersFile) {
      setError('Please upload the Orders file');
      return;
    }

    if (selectedOrdersColumns.length === 0 && selectedCommissionsColumns.length === 0) {
      setError('Please select at least one column from either file');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const extracted = extractCompanyData(
        fullOrdersData.data,
        fullCommissionsData.data,
        selectedOrdersColumns,
        selectedCommissionsColumns
      );
      setExtractedData(extracted);

      analyzeDuplicates(extracted.customers, extracted.locations);
      setCurrentStep(2);
    } catch (err) {
      setError(`Error processing files: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }, [ordersFile, selectedOrdersColumns, selectedCommissionsColumns, fullOrdersData.data, fullCommissionsData.data, extractCompanyData, analyzeDuplicates]);

  // Resolve duplicate
  const resolveDuplicate = useCallback((groupId, selectedItem, removedItems) => {
    setResolvedDuplicates(prev => new Map(prev.set(groupId, {
      selected: selectedItem,
      removed: removedItems
    })));

    setDuplicates(prev => ({
      customers: prev.customers.map(group =>
        group.id === groupId ? { ...group, resolved: true } : group
      ),
      locations: prev.locations.map(group =>
        group.id === groupId ? { ...group, resolved: true } : group
      )
    }));
  }, []);

  // Get clean data for export
  const getCleanDataForExport = useCallback((dataType) => {
    const data = dataType === 'customers' ? extractedData.customers : extractedData.locations;

    return data
      .filter(item => {
        const key = `${item['Customer Name'] || ''}_${item['Address 1'] || ''}`;
        // Keep items that are either selected for export or from Orders
        return (item.includeInExport ?? (item.Source !== 'Commissions'));
      })
      .map(item => ({
        'Customer Name': item['Customer Name'] || '',
        'Address 1': item['Address 1'] || '',
        'Address 2': item['Address 2'] || '',
        'City': item['City'] || '',
        'State': item['State'] || '',
        'Zip Code': item['Zip Code'] || '',
        'Source': item['Source'] || 'Orders',
        'includeInExport': item.includeInExport ?? (item.Source !== 'Commissions')
      }))
      .sort((a, b) => {
        const nameCompare = (a['Customer Name'] || '').localeCompare(b['Customer Name'] || '');
        if (nameCompare !== 0) return nameCompare;

        return (a['Address 1'] || '').localeCompare(b['Address 1'] || '');
      });
  }, [extractedData]);
  
  // Cell editing functions for export tables
  const handleCellClick = useCallback((dataType, rowIndex, field, currentValue) => {
    setEditingCell(`${dataType}-${rowIndex}-${field}`);
    setEditValue(currentValue || '');
  }, []);

  const handleCellSave = useCallback((dataType, rowIndex, field) => {
    const updatedData = { ...extractedData };
    const cleanData = getCleanDataForExport(dataType);
    const originalData = dataType === 'customers' ? updatedData.customers : updatedData.locations;

    const itemToUpdate = cleanData[rowIndex];
    const actualIndex = originalData.findIndex(item =>
      item['Customer Name'] === itemToUpdate['Customer Name'] &&
      item['Address 1'] === itemToUpdate['Address 1']
    );

    if (actualIndex !== -1) {
      originalData[actualIndex] = {
        ...originalData[actualIndex],
        [field]: editValue
      };
      setExtractedData(updatedData);
      setRefreshKey(prev => prev + 1);
    }

    setEditingCell(null);
    setEditValue('');
  }, [extractedData, getCleanDataForExport, editValue]);

  const handleCellCancel = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  const handleKeyPress = useCallback((e, dataType, rowIndex, field) => {
    if (e.key === 'Enter') {
      handleCellSave(dataType, rowIndex, field);
    } else if (e.key === 'Escape') {
      handleCellCancel();
    }
  }, [handleCellSave, handleCellCancel]);

  // Handle export selection change
  const handleExportSelectionChange = useCallback((dataType, rowIndex, checked) => {
    const updatedData = { ...extractedData };
    const cleanData = getCleanDataForExport(dataType);
    const originalData = dataType === 'customers' ? updatedData.customers : updatedData.locations;

    const itemToUpdate = cleanData[rowIndex];
    const actualIndex = originalData.findIndex(item =>
      item['Customer Name'] === itemToUpdate['Customer Name'] &&
      item['Address 1'] === itemToUpdate['Address 1']
    );

    if (actualIndex !== -1) {
      originalData[actualIndex] = {
        ...originalData[actualIndex],
        includeInExport: checked
      };
      setExtractedData(updatedData);
      setRefreshKey(prev => prev + 1);
    }
  }, [extractedData, getCleanDataForExport]);

  // Enhanced clean all data with AI
  const cleanAllDataWithAI = useCallback(async (dataType) => {
    setIsCleaningData(true);
    setError('');
    setSuccessMessage('');

    try {
      const currentData = getCleanDataForExport(dataType);
      const totalItems = currentData.length;
      
      if (totalItems === 0) {
        setError('No data to clean');
        return;
      }
      
      const cachedItems = [];
      const itemsToProcess = [];

      currentData.forEach((item, index) => {
        const cacheKey = addressCache.generateKey({
          address1: item['Address 1'],
          address2: item['Address 2'],
          city: item['City'],
          state: item['State'],
          zipCode: item['Zip Code']
        });

        const cached = addressCache.get(cacheKey);
        if (cached) {
          cachedItems.push({ index, item, cached });
        } else {
          itemsToProcess.push({ index, item });
        }
      });

      const updatedData = { ...extractedData };
      const originalData = dataType === 'customers' ? updatedData.customers : updatedData.locations;

      let processedCount = cachedItems.length;
      let successCount = cachedItems.length;

      // Apply cached results immediately
      cachedItems.forEach(({ item, cached }) => {
        const actualIndex = originalData.findIndex(orig =>
          orig['Customer Name'] === item['Customer Name'] &&
          orig['Address 1'] === item['Address 1']
        );

        if (actualIndex !== -1) {
          originalData[actualIndex] = {
            ...originalData[actualIndex],
            ...cached
          };
        }
      });

      if (itemsToProcess.length === 0) {
        setCleaningProgress({ current: totalItems, total: totalItems });
        setSuccessMessage(`Successfully applied cached results for all ${totalItems} ${dataType} records!`);
        setExtractedData(updatedData);
        setRefreshKey(prev => prev + 1);
        setTimeout(() => setSuccessMessage(''), 5000);
        return;
      }

      // Process remaining items with optimized batching
      const batchSize = geminiApiKey ? 8 : 5;
      const delayBetweenBatches = geminiApiKey ? 500 : 1000;

      for (let i = 0; i < itemsToProcess.length; i += batchSize) {
        const batch = itemsToProcess.slice(i, Math.min(i + batchSize, itemsToProcess.length));

        // Process batch concurrently
        const batchResults = await Promise.allSettled(
          batch.map(async ({ item }) => {
            const addressInput = {
              address1: item['Address 1'],
              address2: item['Address 2'],
              city: item['City'],
              state: item['State'],
              zipCode: item['Zip Code']
            };

            return await addressService.cleanWithAI(addressInput, geminiApiKey);
          })
        );

        // Apply results
        batchResults.forEach((result, batchIndex) => {
          const { item } = batch[batchIndex];
          const actualIndex = originalData.findIndex(orig =>
            orig['Customer Name'] === item['Customer Name'] &&
            orig['Address 1'] === item['Address 1']
          );

          if (actualIndex !== -1) {
            if (result.status === 'fulfilled') {
              originalData[actualIndex] = {
                ...originalData[actualIndex],
                ...result.value
              };
              successCount++;
            } else {
              console.error(`Error cleaning address for ${item['Customer Name']}:`, result.reason);
            }
          }

          processedCount++;
          setCleaningProgress({ current: processedCount, total: totalItems });
        });

        // Delay between batches (except for the last batch)
        if (i + batchSize < itemsToProcess.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }

      setExtractedData(updatedData);
      setRefreshKey(prev => prev + 1);

      const cacheStats = addressCache.getStats();
      const message = geminiApiKey 
        ? `Successfully cleaned ${successCount} of ${totalItems} ${dataType} records with Gemini AI! Cache hit rate: ${cacheStats.hitRate}`
        : `Successfully cleaned ${successCount} of ${totalItems} ${dataType} records with basic cleaning. Cache hit rate: ${cacheStats.hitRate}`;
      
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(''), 5000);

    } catch (error) {
      setError(`Enhanced AI cleaning failed: ${error.message}`);
    } finally {
      setIsCleaningData(false);
      setCleaningProgress({ current: 0, total: 0 });
    }
  }, [extractedData, getCleanDataForExport, geminiApiKey]);

  // Reset function
  const reset = useCallback(() => {
    setCurrentStep(1);
    setOrdersFile(null);
    setCommissionsFile(null);
    setOrdersData({ headers: [], data: [] });
    setCommissionsData({ headers: [], data: [] });
    setFullOrdersData({ headers: [], data: [] });
    setFullCommissionsData({ headers: [], data: [] });
    setSelectedOrdersColumns([]);
    setSelectedCommissionsColumns([]);
    setExtractedData({ customers: [], locations: [] });
    setDuplicates({ customers: [], locations: [] });
    setResolvedDuplicates(new Map());
    setEditingCell(null);
    setEditValue('');
    setSearchTerm('');
    setActiveTab('customers');
    setGeminiApiKey('');
    setIsCleaningData(false);
    setCleaningProgress({ current: 0, total: 0 });
    setShowApiKeyInput(false);
    setError('');
    setSuccessMessage('');
    setRefreshKey(0);
  }, []);

  // Memoized filtered data for export tables
  const filteredExportData = useMemo(() => {
    const currentData = getCleanDataForExport(activeTab);
    return searchTerm
      ? currentData.filter(item =>
        Object.values(item).some(value =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
      : currentData;
  }, [getCleanDataForExport, activeTab, searchTerm]);

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">Customer & Location Extraction Workflow</h1>
        <p className="text-gray-600">
          Extract unique customer names and addresses from your orders and commissions files, detect duplicates, and export clean data.
        </p>
      </div>

      {/* Progress Steps */}
      <ProgressSteps currentStep={currentStep} />

      {/* Error Alert */}
      <ErrorAlert error={error} />

      {/* Success Alert */}
      <SuccessAlert message={successMessage} />

      {/* Step 1: Upload & Configure */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <FileUploadCard
              title="Orders File"
              description="Upload your orders CSV or Excel file containing customer information."
              file={ordersFile}
              onFileUpload={handleOrdersFileUpload}
              headers={ordersData.headers}
              previewData={ordersData.data}
              fullData={fullOrdersData.data}
              processing={processing}
              required={true}
            />

            <FileUploadCard
              title="Commissions File (Optional)"
              description="Upload your commissions CSV or Excel file for additional customer data."
              file={commissionsFile}
              onFileUpload={handleCommissionsFileUpload}
              headers={commissionsData.headers}
              previewData={commissionsData.data}
              fullData={fullCommissionsData.data}
              processing={processing}
              required={false}
            />
          </div>

          {/* Column Selection */}
          {ordersData.headers.length > 0 && (
            <ColumnSelector
              title="Select Orders File Columns (Customer Name & Address Fields)"
              headers={ordersData.headers}
              selectedColumns={selectedOrdersColumns}
              onSelectionChange={setSelectedOrdersColumns}
            />
          )}

          {commissionsData.headers.length > 0 && (
            <ColumnSelector
              title="Select Commissions File Columns (Customer Name & Address Fields)"
              headers={commissionsData.headers}
              selectedColumns={selectedCommissionsColumns}
              onSelectionChange={setSelectedCommissionsColumns}
            />
          )}

          <div className="text-center">
            <button
              onClick={processStep1}
              disabled={!ordersFile || processing || (selectedOrdersColumns.length === 0 && selectedCommissionsColumns.length === 0)}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-8 rounded-lg transition-colors mr-4"
            >
              {processing ? 'Processing...' : 'Extract Data & Detect Duplicates'}
            </button>

            {ordersFile && (
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

      {/* Step 2: Review Duplicates */}
      {currentStep === 2 && (
        <div className="space-y-6">
          {/* Results Summary */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-green-800 mb-4">Data Extraction Complete!</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="flex items-center">
                <Users className="h-6 w-6 text-green-600 mr-3" />
                <span className="text-green-700">
                  <strong>{extractedData.customers.length}</strong> unique customers found
                </span>
              </div>
              <div className="flex items-center">
                <MapPin className="h-6 w-6 text-green-600 mr-3" />
                <span className="text-green-700">
                  <strong>{extractedData.locations.length}</strong> unique locations found
                </span>
              </div>
              <div className="flex items-center">
                <AlertTriangle className="h-6 w-6 text-orange-500 mr-3" />
                <span className="text-orange-700">
                  <strong>{totalDuplicateGroups}</strong> potential duplicate groups detected
                </span>
              </div>
            </div>
          </div>

          <DuplicateDetectionPanel
            duplicates={duplicates}
            onResolveDuplicate={resolveDuplicate}
            duplicateThreshold={duplicateThreshold}
            onThresholdChange={handleThresholdChange}
          />

          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Upload
            </button>
            <div className="flex gap-3">
              {unresolvedDuplicateGroups > 0 && (
                <div className="text-orange-600 text-sm flex items-center">
                  <AlertTriangle className="w-4 h-4 mr-1" />
                  {unresolvedDuplicateGroups} unresolved duplicates
                </div>
              )}
              <button
                onClick={() => setCurrentStep(3)}
                className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-8 rounded-lg transition-colors"
              >
                Continue to Export
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Export Results */}
      {currentStep === 3 && (
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Edit & Export Clean Data</h1>
                <p className="mt-2 text-gray-600">Review and edit your cleaned customer and location data before export</p>
                {resolvedDuplicates.size > 0 && (
                  <p className="mt-1 text-sm text-green-600">
                    ✓ {resolvedDuplicates.size} duplicate group(s) resolved and excluded from export
                  </p>
                )}
              </div>
              <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => dataService.downloadCSV(getCleanDataForExport('customers'), 'unique_customers.csv')}
                  disabled={getCleanDataForExport('customers').length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                >
                  <Download className="w-4 h-4" />
                  Export Customers ({getCleanDataForExport('customers').length})
                </button>
                <button
                  onClick={() => dataService.downloadCSV(getCleanDataForExport('locations'), 'unique_locations.csv')}
                  disabled={getCleanDataForExport('locations').length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400"
                >
                  <Download className="w-4 h-4" />
                  Export Locations ({getCleanDataForExport('locations').length})
                </button>
              </div>
            </div>
          </div>

          {/* Cache Stats */}
          <CacheStatsCard onClearCache={() => setRefreshKey(prev => prev + 1)} />


          {/* AI Data Cleaning Section */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-purple-600" />
                  Enhanced AI-Powered Address Cleaning
                </h2>
                <p className="text-gray-600 text-sm mt-1">
                  Use Google Gemini AI with intelligent caching and concurrent processing for faster address standardization
                </p>
              </div>
              <button
                onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Settings className="w-4 h-4" />
                {showApiKeyInput ? 'Hide' : 'Setup'} API Key
              </button>
            </div>

            {/* API Key Input */}
            {showApiKeyInput && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <label className="block text-sm font-medium text-blue-900 mb-2">
                  Gemini API Key {!geminiApiKey && <span className="text-orange-600">(Without this, basic cleaning will be used)</span>}
                </label>
                <div className="flex gap-3">
                  <input
                    type="password"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder="Enter your Gemini API key..."
                    className="flex-1 px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={() => setShowApiKeyInput(false)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Save
                  </button>
                </div>
                <p className="text-blue-700 text-xs mt-2">
                  Get your free API key from <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline">Google AI Studio</a>
                </p>
              </div>
            )}

            {/* Cleaning Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => cleanAllDataWithAI('customers')}
                disabled={isCleaningData || getCleanDataForExport('customers').length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400"
              >
                <RefreshCw className={`w-4 h-4 ${isCleaningData ? 'animate-spin' : ''}`} />
                Clean Customers ({getCleanDataForExport('customers').length})
              </button>

              <button
                onClick={() => cleanAllDataWithAI('locations')}
                disabled={isCleaningData || getCleanDataForExport('locations').length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400"
              >
                <RefreshCw className={`w-4 h-4 ${isCleaningData ? 'animate-spin' : ''}`} />
                Clean Locations ({getCleanDataForExport('locations').length})
              </button>

              {isCleaningData && (
                <div className="flex items-center gap-2 text-sm text-purple-600">
                  <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse"></div>
                  Cleaning... {cleaningProgress.current} of {cleaningProgress.total}
                </div>
              )}
            </div>

            {/* Enhanced Cleaning Info */}
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Enhanced AI Cleaning Features:</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h5 className="font-medium text-gray-800">Intelligence:</h5>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• {geminiApiKey ? 'Google Gemini AI for intelligent parsing' : 'Basic rules-based cleaning (provide API key for AI)'}</li>
                    <li>• Smart address component extraction</li>
                    <li>• Context-aware standardization</li>
                    <li>• Proper title case formatting</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-medium text-gray-800">Performance:</h5>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• Intelligent caching for instant repeats</li>
                    <li>• Concurrent batch processing (8 at once)</li>
                    <li>• Automatic retry with exponential backoff</li>
                    <li>• Real-time cache statistics</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
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
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8 px-6">
                <button
                  onClick={() => setActiveTab('customers')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'customers'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Customers ({getCleanDataForExport('customers').length})
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('locations')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'locations'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Locations ({getCleanDataForExport('locations').length})
                  </div>
                </button>
              </nav>
            </div>

            {/* Data Table */}
            <div className="p-6">
              <EditableDataTable
                data={filteredExportData}
                dataType={activeTab}
                editingCell={editingCell}
                editValue={editValue}
                onCellClick={handleCellClick}
                onCellSave={handleCellSave}
                onEditValueChange={setEditValue}
                onKeyPress={handleKeyPress}
                refreshKey={refreshKey}
                onExportSelectionChange={handleExportSelectionChange}
              />

              {filteredExportData.length === 0 && searchTerm && (
                <div className="text-center py-8">
                  <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
                  <p className="text-gray-600">Try adjusting your search terms.</p>
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="p-6 bg-blue-50 border-t border-blue-200">
              <h4 className="font-medium text-blue-900 mb-2">Enhanced Editing Instructions</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Click on any cell to edit its value</li>
                <li>• Empty fields are highlighted in red - fill them in to complete your data</li>
                <li>• Press Enter to save changes or Escape to cancel</li>
                <li>• Use the search bar to find specific records</li>
                <li>• AI cleaning uses intelligent caching for faster repeated operations</li>
                <li>• Check cache statistics above to monitor performance</li>
                <li>• Export buttons will download the current data with your edits</li>
              </ul>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep(2)}
              className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Duplicates
            </button>
            <button
              onClick={reset}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Start New Workflow
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowApp;