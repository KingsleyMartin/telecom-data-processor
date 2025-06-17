"use client";

import React, { useState, useCallback } from 'react';
import { Upload, Download, FileText, Settings, Eye, EyeOff, Edit3 } from 'lucide-react';
import * as XLSX from 'xlsx';

const CustomerExtractor = () => {
  const [files, setFiles] = useState([]);
  const [processedData, setProcessedData] = useState([]);
  const [columnMappings, setColumnMappings] = useState({});
  const [showMissingAddresses, setShowMissingAddresses] = useState(true);
  const [showDuplicates, setShowDuplicates] = useState(true);
  const [selectedRecords, setSelectedRecords] = useState(new Set());
  const [editingCell, setEditingCell] = useState(null);
  const [step, setStep] = useState(1); // 1: Upload, 2: Mapping, 3: Results

  // Parse CSV function
  const parseCSV = (content) => {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { headers: [], data: [] };
    
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
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

  // Parse Excel function
  const parseExcel = (fileBuffer) => {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (jsonData.length === 0) return { headers: [], data: [] };
      
      const headers = jsonData[0].map(h => String(h || '').trim());
      const data = jsonData.slice(1).map(row => {
        const rowData = {};
        headers.forEach((header, index) => {
          rowData[header] = String(row[index] || '').trim();
        });
        return rowData;
      }).filter(row => Object.values(row).some(val => val)); // Filter out empty rows
      
      return { headers, data };
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      return { headers: [], data: [] };
    }
  };

  // Handle file upload
  const handleFileUpload = async (event) => {
    const uploadedFiles = Array.from(event.target.files);
    const fileData = [];
    
    for (const file of uploadedFiles) {
      try {
        let parsed;
        
        if (file.name.toLowerCase().endsWith('.csv')) {
          const content = await file.text();
          parsed = parseCSV(content);
        } else if (file.name.toLowerCase().match(/\.(xlsx|xls)$/)) {
          const buffer = await file.arrayBuffer();
          parsed = parseExcel(buffer);
        } else {
          console.warn(`Unsupported file type: ${file.name}`);
          continue;
        }
        
        // Auto-detect column mappings
        const mapping = {};
        parsed.headers.forEach(header => {
          const lowerHeader = header.toLowerCase();
          if (lowerHeader.includes('customer') || lowerHeader.includes('company')) {
            mapping.companyName = header;
          } else if (lowerHeader.includes('address') && !lowerHeader.includes('2')) {
            mapping.address = header;
          } else if (lowerHeader.includes('city')) {
            mapping.city = header;
          } else if (lowerHeader.includes('state')) {
            mapping.state = header;
          } else if (lowerHeader.includes('zip')) {
            mapping.zipCode = header;
          }
        });
        
        fileData.push({
          name: file.name,
          headers: parsed.headers,
          data: parsed.data,
          mapping
        });
      } catch (error) {
        console.error(`Error parsing file ${file.name}:`, error);
      }
    }
    
    setFiles(fileData);
    
    // Initialize column mappings
    const initialMappings = {};
    fileData.forEach((file, index) => {
      initialMappings[index] = file.mapping;
    });
    setColumnMappings(initialMappings);
    
    if (fileData.length > 0) {
      setStep(2);
    }
  };

  // Update column mapping
  const updateColumnMapping = (fileIndex, field, column) => {
    setColumnMappings(prev => ({
      ...prev,
      [fileIndex]: {
        ...prev[fileIndex],
        [field]: column === 'none' ? null : column
      }
    }));
  };

  // Gemini API placeholder for address standardization
  const standardizeWithGemini = async (companyName, address) => {
    // PLACEHOLDER: Replace with actual Gemini API call
    console.log('Gemini API Call Placeholder:', { companyName, address });
    
    // Mock standardization logic
    const standardized = {
      companyName: companyName.replace(/\b\w/g, l => l.toUpperCase()).trim(),
      address1: '',
      address2: '',
      city: '',
      state: '',
      zipCode: ''
    };
    
    if (address) {
      // Simple address parsing logic (would be replaced by Gemini)
      const parts = address.split(',').map(p => p.trim());
      if (parts.length >= 4) {
        standardized.address1 = parts[0];
        standardized.city = parts[parts.length - 3];
        standardized.state = parts[parts.length - 2];
        standardized.zipCode = parts[parts.length - 1];
        
        // Extract suite/apartment info to address2 and remove from address1
        const suiteRegex = /\s+(suite|ste|apt|apartment|unit|floor|#)\s*(.+)/i;
        const match = standardized.address1.match(suiteRegex);
        if (match) {
          // Remove the suite information from address1
          standardized.address1 = standardized.address1.replace(suiteRegex, '').trim();
          // Add the suite information to address2
          standardized.address2 = `${match[1]} ${match[2]}`.trim();
        }
      } else {
        standardized.address1 = address;
        
        // Still check for suite info even in single address field
        const suiteRegex = /\s+(suite|ste|apt|apartment|unit|floor|#)\s*(.+)/i;
        const match = standardized.address1.match(suiteRegex);
        if (match) {
          standardized.address1 = standardized.address1.replace(suiteRegex, '').trim();
          standardized.address2 = `${match[1]} ${match[2]}`.trim();
        }
      }
    }
    
    return standardized;
  };

  // Calculate address completeness score
  const calculateAddressScore = (record) => {
    let score = 0;
    
    // Higher score for separated fields
    if (record.address1 && record.address1.trim()) score += 2;
    if (record.city && record.city.trim()) score += 2;
    if (record.state && record.state.trim()) score += 2;
    if (record.zipCode && record.zipCode.trim()) score += 2;
    
    // Bonus for records from Orders file (which typically have separated fields)
    if (record.source && record.source.toLowerCase().includes('order')) score += 1;
    
    // Penalty for addresses that look like combined strings (contain commas)
    if (record.address1 && record.address1.includes(',')) score -= 1;
    
    return score;
  };

  // Process files and extract data
  const processFiles = async () => {
    const allRecords = [];
    
    // Process files in order (Orders first as requested)
    const sortedFiles = [...files].sort((a, b) => {
      if (a.name.toLowerCase().includes('order')) return -1;
      if (b.name.toLowerCase().includes('order')) return 1;
      return 0;
    });
    
    for (const [fileIndex, file] of sortedFiles.entries()) {
      const mapping = columnMappings[files.indexOf(file)];
      
      for (const row of file.data) {
        if (!mapping.companyName || !row[mapping.companyName]) continue;
        
        const companyName = row[mapping.companyName];
        let address = '';
        let city = '';
        let state = '';
        let zipCode = '';
        
        // Handle separated address fields
        if (mapping.address) address = row[mapping.address] || '';
        if (mapping.city) city = row[mapping.city] || '';
        if (mapping.state) state = row[mapping.state] || '';
        if (mapping.zipCode) zipCode = row[mapping.zipCode] || '';
        
        // If we have separated fields, construct full address for standardization
        let fullAddress = address;
        if (city || state || zipCode) {
          fullAddress = [address, city, state, zipCode].filter(Boolean).join(', ');
        }
        
        // Apply Gemini standardization
        const standardized = await standardizeWithGemini(companyName, fullAddress);
        
        // Use original separated fields if available, otherwise use standardized
        const record = {
          companyName: standardized.companyName,
          address1: address || standardized.address1,
          address2: standardized.address2,
          city: city || standardized.city,
          state: state || standardized.state,
          zipCode: zipCode || standardized.zipCode,
          source: file.name,
          originalAddress: fullAddress
        };
        
        allRecords.push(record);
      }
    }
    
    // Deduplication and similarity detection logic
    const uniqueRecords = [];
    const seen = new Set();
    const duplicateGroups = new Map();
    
    for (const record of allRecords) {
      const key = `${record.companyName.toLowerCase()}_${record.address1.toLowerCase()}_${record.city.toLowerCase()}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRecords.push({
          ...record,
          isDuplicate: false,
          isSimilar: false,
          isSelectableDuplicate: false
        });
      } else {
        // Mark as duplicate and highlight
        const existingIndex = uniqueRecords.findIndex(r => 
          r.companyName.toLowerCase() === record.companyName.toLowerCase() &&
          r.address1.toLowerCase() === record.address1.toLowerCase() &&
          r.city.toLowerCase() === record.city.toLowerCase()
        );
        
        if (existingIndex >= 0) {
          uniqueRecords[existingIndex].isDuplicate = true;
          const newRecord = {
            ...record,
            isDuplicate: true,
            isSimilar: false,
            isSelectableDuplicate: false
          };
          uniqueRecords.push(newRecord);
          
          // Track duplicate groups
          if (!duplicateGroups.has(key)) {
            duplicateGroups.set(key, [existingIndex]);
          }
          duplicateGroups.get(key).push(uniqueRecords.length - 1);
        }
      }
    }
    
    // Mark the best record in each duplicate group as selectable
    duplicateGroups.forEach(indices => {
      let bestIndex = indices[0];
      let bestScore = calculateAddressScore(uniqueRecords[bestIndex]);
      
      // Find the best record in this duplicate group
      for (let i = 1; i < indices.length; i++) {
        const currentScore = calculateAddressScore(uniqueRecords[indices[i]]);
        if (currentScore > bestScore) {
          bestScore = currentScore;
          bestIndex = indices[i];
        }
      }
      
      // Mark the best record as selectable
      uniqueRecords[bestIndex].isSelectableDuplicate = true;
    });
    
    // Detect similar addresses (same company, similar first characters in address)
    for (let i = 0; i < uniqueRecords.length; i++) {
      for (let j = i + 1; j < uniqueRecords.length; j++) {
        const record1 = uniqueRecords[i];
        const record2 = uniqueRecords[j];
        
        // Check if same company name and similar address start
        if (record1.companyName.toLowerCase() === record2.companyName.toLowerCase() &&
            !record1.isDuplicate && !record2.isDuplicate &&
            record1.address1 && record2.address1) {
          
          // Compare first 15 characters, ignore case and normalize spaces
          const addr1 = record1.address1.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 15);
          const addr2 = record2.address1.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 15);
          
          // Check if addresses are similar (at least 80% character match)
          if (addr1.length >= 3 && addr2.length >= 3) {
            const minLength = Math.min(addr1.length, addr2.length);
            let matches = 0;
            
            // Count matching characters from the beginning
            for (let k = 0; k < minLength; k++) {
              if (addr1[k] === addr2[k]) {
                matches++;
              } else {
                break; // Stop at first non-matching character
              }
            }
            
            // Calculate similarity based on minimum length (more strict)
            const similarity = matches / minLength;
            
            // Mark as similar if 80% or more characters match from the start
            if (similarity >= 0.8) {
              uniqueRecords[i].isSimilar = true;
              uniqueRecords[j].isSimilar = true;
            }
          }
        }
      }
    }
    
    // Sort by company name, then address
    uniqueRecords.sort((a, b) => {
      const nameCompare = a.companyName.localeCompare(b.companyName);
      if (nameCompare !== 0) return nameCompare;
      return a.address1.localeCompare(b.address1);
    });
    
    setProcessedData(uniqueRecords);
    
    // Initialize selected records (all non-duplicates and selectable duplicates selected by default)
    const initialSelected = new Set();
    uniqueRecords.forEach((record, index) => {
      if (!record.isDuplicate || record.isSelectableDuplicate) {
        initialSelected.add(index);
      }
    });
    setSelectedRecords(initialSelected);
    
    setStep(3);
  };

  // Handle individual record selection
  const toggleRecordSelection = (recordIndex) => {
    const newSelected = new Set(selectedRecords);
    if (newSelected.has(recordIndex)) {
      newSelected.delete(recordIndex);
    } else {
      newSelected.add(recordIndex);
    }
    setSelectedRecords(newSelected);
  };

  // Handle cell editing
  const handleCellEdit = (recordIndex, field, value) => {
    const updatedData = [...processedData];
    updatedData[recordIndex] = {
      ...updatedData[recordIndex],
      [field]: value
    };
    setProcessedData(updatedData);
  };

  // Handle cell click for editing
  const handleCellClick = (recordIndex, field) => {
    setEditingCell({ recordIndex, field });
  };

  // Handle cell blur (finish editing)
  const handleCellBlur = () => {
    setEditingCell(null);
  };

  // Handle select all/none for visible selectable records
  const toggleSelectAll = () => {
    const visibleSelectableIndices = [];
    filteredData.forEach((record, displayIndex) => {
      // Find the original index in processedData
      const originalIndex = processedData.findIndex(r => 
        r.companyName === record.companyName && 
        r.address1 === record.address1 && 
        r.city === record.city &&
        r.source === record.source
      );
      if (originalIndex !== -1 && (!record.isDuplicate || record.isSelectableDuplicate)) {
        visibleSelectableIndices.push(originalIndex);
      }
    });

    const allVisible = visibleSelectableIndices.every(index => selectedRecords.has(index));
    const newSelected = new Set(selectedRecords);
    
    if (allVisible) {
      // Deselect all visible
      visibleSelectableIndices.forEach(index => newSelected.delete(index));
    } else {
      // Select all visible
      visibleSelectableIndices.forEach(index => newSelected.add(index));
    }
    
    setSelectedRecords(newSelected);
  };

  // Filter duplicates while preserving the best record from each group
  const filterDuplicates = (data) => {
    if (showDuplicates) return data;
    
    // Group records by duplicate key
    const groups = new Map();
    
    data.forEach(record => {
      const key = `${record.companyName.toLowerCase()}_${record.address1.toLowerCase()}_${record.city.toLowerCase()}`;
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(record);
    });
    
    // For each group, select the best record
    const filteredData = [];
    
    groups.forEach(group => {
      if (group.length === 1) {
        // No duplicates, keep the record
        filteredData.push(group[0]);
      } else {
        // Multiple records, find the best one
        const bestRecord = group.reduce((best, current) => {
          // Prefer records with separated address fields
          const bestScore = calculateAddressScore(best);
          const currentScore = calculateAddressScore(current);
          
          return currentScore > bestScore ? current : best;
        });
        
        filteredData.push(bestRecord);
      }
    });
    
    return filteredData;
  };

  // Export to CSV
  const exportToCSV = () => {
    // Get selected records only
    const selectedData = processedData.filter((record, index) => selectedRecords.has(index));
    
    let filteredData = selectedData;
    
    // Filter based on missing addresses
    if (!showMissingAddresses) {
      filteredData = filteredData.filter(record => 
        record.address1 && record.city && record.state && record.zipCode
      );
    }
    
    // Filter duplicates while preserving best records
    filteredData = filterDuplicates(filteredData);
    
    // Group records by company name (case insensitive)
    const companyGroups = new Map();
    filteredData.forEach(record => {
      const companyKey = record.companyName.toLowerCase().trim();
      if (!companyGroups.has(companyKey)) {
        companyGroups.set(companyKey, []);
      }
      companyGroups.get(companyKey).push(record);
    });
    
    // Separate into first records (Customer Names) and additional locations (Customer Locations)
    const customerNames = [];
    const customerLocations = [];
    
    companyGroups.forEach(records => {
      // Sort records by address to ensure consistent "first" record selection
      const sortedRecords = records.sort((a, b) => {
        const addressA = `${a.address1} ${a.city} ${a.state}`.toLowerCase();
        const addressB = `${b.address1} ${b.city} ${b.state}`.toLowerCase();
        return addressA.localeCompare(addressB);
      });
      
      // First record goes to Customer Names
      if (sortedRecords.length > 0) {
        customerNames.push(sortedRecords[0]);
      }
      
      // Remaining records go to Customer Locations
      if (sortedRecords.length > 1) {
        customerLocations.push(...sortedRecords.slice(1));
      }
    });
    
    const headers = ['Company Name', 'Address 1', 'Address 2', 'City', 'State', 'Zip Code'];
    
    // Create Customer Names CSV
    const customerNamesContent = [
      headers.join(','),
      ...customerNames.map(record => [
        `"${record.companyName}"`,
        `"${record.address1}"`,
        `"${record.address2}"`,
        `"${record.city}"`,
        `"${record.state}"`,
        `"${record.zipCode}"`
      ].join(','))
    ].join('\n');
    
    // Create Customer Locations CSV
    const customerLocationsContent = [
      headers.join(','),
      ...customerLocations.map(record => [
        `"${record.companyName}"`,
        `"${record.address1}"`,
        `"${record.address2}"`,
        `"${record.city}"`,
        `"${record.state}"`,
        `"${record.zipCode}"`
      ].join(','))
    ].join('\n');
    
    // Download Customer Names CSV
    const customerNamesBlob = new Blob([customerNamesContent], { type: 'text/csv' });
    const customerNamesUrl = URL.createObjectURL(customerNamesBlob);
    const customerNamesLink = document.createElement('a');
    customerNamesLink.href = customerNamesUrl;
    customerNamesLink.download = 'Customer Names.csv';
    customerNamesLink.click();
    URL.revokeObjectURL(customerNamesUrl);
    
    // Download Customer Locations CSV (only if there are additional locations)
    if (customerLocations.length > 0) {
      const customerLocationsBlob = new Blob([customerLocationsContent], { type: 'text/csv' });
      const customerLocationsUrl = URL.createObjectURL(customerLocationsBlob);
      const customerLocationsLink = document.createElement('a');
      customerLocationsLink.href = customerLocationsUrl;
      customerLocationsLink.download = 'Customer Locations.csv';
      customerLocationsLink.click();
      URL.revokeObjectURL(customerLocationsUrl);
    }
  };

  let filteredData = processedData;
  
  // Filter based on missing addresses
  if (!showMissingAddresses) {
    filteredData = filteredData.filter(record => 
      record.address1 && record.city && record.state && record.zipCode
    );
  }
  
  // Filter duplicates while preserving best records
  filteredData = filterDuplicates(filteredData);

  // Count selected records in current view
  const selectedCount = filteredData.filter((record, displayIndex) => {
    const originalIndex = processedData.findIndex(r => 
      r.companyName === record.companyName && 
      r.address1 === record.address1 && 
      r.city === record.city &&
      r.source === record.source
    );
    return originalIndex !== -1 && selectedRecords.has(originalIndex) && (!record.isDuplicate || record.isSelectableDuplicate);
  }).length;

  // Render editable cell
  const renderEditableCell = (record, field, originalIndex) => {
    const isEditing = editingCell?.recordIndex === originalIndex && editingCell?.field === field;
    const value = record[field] || '';
    
    if (isEditing) {
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => handleCellEdit(originalIndex, field, e.target.value)}
          onBlur={handleCellBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              handleCellBlur();
            }
          }}
          className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
      );
    }
    
    return (
      <div
        onClick={() => handleCellClick(originalIndex, field)}
        className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded min-h-[24px] flex items-center group"
        title="Click to edit"
      >
        <span className="flex-1">{value}</span>
        <Edit3 size={12} className="opacity-0 group-hover:opacity-50 ml-1" />
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <FileText className="text-blue-600" />
          CSV/Excel Company Address Extractor
        </h1>
        
        {/* Step Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map(stepNumber => (
              <div key={stepNumber} className={`flex items-center ${stepNumber < 3 ? 'flex-1' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= stepNumber ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
                }`}>
                  {stepNumber}
                </div>
                <span className={`ml-2 text-sm ${step >= stepNumber ? 'text-blue-600' : 'text-gray-500'}`}>
                  {stepNumber === 1 ? 'Upload Files' : stepNumber === 2 ? 'Map Columns' : 'Review Results'}
                </span>
                {stepNumber < 3 && <div className={`flex-1 h-0.5 mx-4 ${step > stepNumber ? 'bg-blue-600' : 'bg-gray-300'}`} />}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: File Upload */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <div className="text-lg font-medium text-gray-700 mb-2">Upload CSV or Excel Files</div>
              <div className="text-gray-500 mb-4">Select one or more CSV (.csv) or Excel (.xlsx, .xls) files to process</div>
              <input
                type="file"
                multiple
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
              >
                Choose Files
              </label>
            </div>
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                <Settings className="text-blue-600" />
                Map Columns
              </h2>
              <button
                onClick={processFiles}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Process Files
              </button>
            </div>
            
            {files.map((file, fileIndex) => (
              <div key={fileIndex} className="border rounded-lg p-4">
                <h3 className="font-medium text-gray-800 mb-4">{file.name}</h3>
                <div className="grid grid-cols-2 gap-4">
                  {['companyName', 'address', 'city', 'state', 'zipCode'].map(field => (
                    <div key={field}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {field === 'companyName' ? 'Company Name' : 
                         field === 'address' ? 'Address' :
                         field === 'city' ? 'City' :
                         field === 'state' ? 'State' : 'Zip Code'}
                      </label>
                      <select
                        value={columnMappings[fileIndex]?.[field] || 'none'}
                        onChange={(e) => updateColumnMapping(fileIndex, field, e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                      >
                        <option value="none">-- None --</option>
                        {file.headers.map(header => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 3: Results */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800">
                Extracted Companies ({filteredData.length} records, {selectedCount} selected)
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowMissingAddresses(!showMissingAddresses)}
                  className={`px-4 py-2 rounded-md border flex items-center gap-2 ${
                    showMissingAddresses 
                      ? 'bg-gray-100 text-gray-700 border-gray-300' 
                      : 'bg-blue-100 text-blue-700 border-blue-300'
                  }`}
                >
                  {showMissingAddresses ? <EyeOff size={16} /> : <Eye size={16} />}
                  {showMissingAddresses ? 'Hide' : 'Show'} Missing Address Records
                </button>
                <button
                  onClick={() => setShowDuplicates(!showDuplicates)}
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
                  onClick={exportToCSV}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
                  title="Exports two files: Customer Names.csv (first location per company) and Customer Locations.csv (additional locations)"
                >
                  <Download size={16} />
                  Export CSVs
                </button>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-700 flex items-center gap-2">
                <Edit3 size={16} />
                <strong>Tip:</strong> Click on any cell in the table below to edit its contents directly.
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-700 flex items-center gap-2">
                <Download size={16} />
                <strong>Export Info:</strong> The export will create two CSV files: "Customer Names.csv" (first location for each company) and "Customer Locations.csv" (additional locations for companies with multiple addresses).
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-4 py-2 text-left">
                      <input
                        type="checkbox"
                        onChange={toggleSelectAll}
                        checked={filteredData.filter(r => !r.isDuplicate || r.isSelectableDuplicate).length > 0 && 
                                filteredData.filter(r => !r.isDuplicate || r.isSelectableDuplicate).every((record) => {
                                  const originalIndex = processedData.findIndex(r => 
                                    r.companyName === record.companyName && 
                                    r.address1 === record.address1 && 
                                    r.city === record.city &&
                                    r.source === record.source
                                  );
                                  return originalIndex !== -1 && selectedRecords.has(originalIndex);
                                })}
                        className="rounded"
                      />
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Company Name</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Address 1</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Address 2</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">City</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">State</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Zip Code</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((record, index) => {
                    let rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                    
                    if (record.isDuplicate) {
                      rowClass = 'bg-yellow-100';
                    } else if (record.isSimilar) {
                      rowClass = 'bg-red-100';
                    }
                    
                    // Find original index for checkbox state
                    const originalIndex = processedData.findIndex(r => 
                      r.companyName === record.companyName && 
                      r.address1 === record.address1 && 
                      r.city === record.city &&
                      r.source === record.source
                    );
                    
                    return (
                      <tr key={index} className={rowClass}>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {(!record.isDuplicate || record.isSelectableDuplicate) ? (
                            <input
                              type="checkbox"
                              checked={originalIndex !== -1 && selectedRecords.has(originalIndex)}
                              onChange={() => originalIndex !== -1 && toggleRecordSelection(originalIndex)}
                              className="rounded"
                            />
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="border border-gray-300 px-2 py-1">
                          {renderEditableCell(record, 'companyName', originalIndex)}
                        </td>
                        <td className="border border-gray-300 px-2 py-1">
                          {renderEditableCell(record, 'address1', originalIndex)}
                        </td>
                        <td className="border border-gray-300 px-2 py-1">
                          {renderEditableCell(record, 'address2', originalIndex)}
                        </td>
                        <td className="border border-gray-300 px-2 py-1">
                          {renderEditableCell(record, 'city', originalIndex)}
                        </td>
                        <td className="border border-gray-300 px-2 py-1">
                          {renderEditableCell(record, 'state', originalIndex)}
                        </td>
                        <td className="border border-gray-300 px-2 py-1">
                          {renderEditableCell(record, 'zipCode', originalIndex)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setStep(1);
                  setSelectedRecords(new Set());
                  setEditingCell(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Start Over
              </button>
              <div className="flex gap-4 text-sm text-gray-600 items-center">
                <div className="flex items-center">
                  <input type="checkbox" checked readOnly className="mr-2 rounded" />
                  Select for export
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 mr-2"></div>
                  Exact duplicates
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-red-100 border border-red-300 mr-2"></div>
                  Similar addresses (same company)
                </div>
                <div className="flex items-center">
                  <Edit3 size={14} className="mr-2 text-gray-400" />
                  Click cells to edit
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerExtractor;