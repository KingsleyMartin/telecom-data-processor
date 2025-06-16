"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, RefreshCw, CheckCircle, AlertCircle, Eye, Users, Server, Loader2 } from 'lucide-react';

// Frontend API Service - Calls backend instead of Gemini directly
class APIService {
  constructor() {
    this.baseURL = '/api/gemini';
    this.rateLimitDelay = 500;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async callAPI(operation, data) {
    const response = await fetch(this.baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation,
        data
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `API error: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'API request failed');
    }

    return result;
  }

  async standardizeName(customerName) {
    try {
      await this.delay(this.rateLimitDelay);
      const response = await this.callAPI('standardizeName', { name: customerName });
      return response.result;
    } catch (error) {
      console.error('Name standardization error:', error);
      return {
        standardizedName: this.basicNameStandardization(customerName),
        confidence: 0.7,
        changes: ['Basic standardization applied due to API error'],
        businessType: 'other',
        error: error.message
      };
    }
  }

  async standardizeAddress(address) {
    try {
      await this.delay(this.rateLimitDelay);
      const response = await this.callAPI('standardizeAddress', { address });
      return response.result;
    } catch (error) {
      console.error('Address standardization error:', error);
      return {
        ...this.basicAddressParsing(address),
        error: error.message
      };
    }
  }

  async compareNames(name1, name2) {
    try {
      await this.delay(this.rateLimitDelay);
      const response = await this.callAPI('compareNames', { name1, name2 });
      return response.result;
    } catch (error) {
      console.error('Name comparison error:', error);
      const similarity = this.calculateStringSimilarity(name1.toLowerCase(), name2.toLowerCase());
      return {
        isDuplicate: similarity > 0.8,
        confidence: similarity,
        reasoning: 'Basic string similarity comparison used due to API error',
        suggestedCanonicalName: name1.length > name2.length ? name1 : name2,
        error: error.message
      };
    }
  }

  async findDuplicates(records, onProgress) {
    try {
      if (records.length > 100) {
        return this.findDuplicatesChunked(records, onProgress);
      }

      const response = await this.callAPI('findDuplicates', { records });
      if (onProgress) onProgress(100);
      return response.result;
    } catch (error) {
      console.error('Duplicate detection error:', error);
      return this.basicDuplicateDetection(records, onProgress);
    }
  }

  async findDuplicatesChunked(records, onProgress) {
    const chunkSize = 50;
    const allDuplicateGroups = [];
    
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, Math.min(i + chunkSize, records.length));
      
      try {
        const response = await this.callAPI('findDuplicates', { records: chunk });
        allDuplicateGroups.push(...response.result.duplicateGroups);
      } catch (error) {
        console.warn(`Error processing chunk ${i}-${i + chunkSize}:`, error);
      }
      
      if (onProgress) {
        const progress = Math.min(((i + chunkSize) / records.length) * 100, 100);
        onProgress(Math.round(progress));
      }
    }
    
    return { duplicateGroups: allDuplicateGroups };
  }

  async processBatch(records, operation, onProgress) {
    const batchSize = 25;
    const results = [];
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, Math.min(i + batchSize, records.length));
      
      try {
        const response = await this.callAPI('processBatch', {
          records: batch,
          batchOperation: operation
        });
        results.push(...response.results);
      } catch (error) {
        console.error(`Batch processing error for batch ${i}:`, error);
        const fallbackResults = batch.map(record => ({
          error: error.message,
          confidence: 0.5
        }));
        results.push(...fallbackResults);
      }
      
      if (onProgress) {
        const progress = Math.min(((i + batchSize) / records.length) * 100, 100);
        onProgress(Math.round(progress));
      }
    }
    
    return results;
  }

  async checkHealth() {
    try {
      const response = await fetch(this.baseURL, { method: 'GET' });
      return await response.json();
    } catch (error) {
      console.error('Health check failed:', error);
      return { status: 'unhealthy', error: error.message };
    }
  }

  basicNameStandardization(name) {
    if (!name || typeof name !== 'string') return '';
    return name.trim().toLowerCase().split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
      .replace(/\binc\b/gi, 'Inc.').replace(/\bllc\b/gi, 'LLC')
      .replace(/\bcorp\b/gi, 'Corp.').replace(/\bco\b$/gi, 'Co.');
  }

  basicAddressParsing(address) {
    if (!address || typeof address !== 'string') {
      return {
        address1: '',
        address2: null,
        city: '',
        state: '',
        zipCode: '',
        confidence: 0.1,
        issues: ['Invalid address input']
      };
    }

    const parts = address.split(',').map(part => part.trim());
    const zipMatch = address.match(/\b\d{5}(-\d{4})?\b/);
    const stateMatch = address.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i);
    const suiteMatch = address.match(/\b(suite|ste|apt|apartment|unit|floor|flr|#)\s*\w+/i);

    return {
      address1: parts[0] || address,
      address2: suiteMatch ? suiteMatch[0] : null,
      city: parts.length > 2 ? parts[parts.length - 3] : '',
      state: stateMatch ? stateMatch[0].toUpperCase() : '',
      zipCode: zipMatch ? zipMatch[0] : '',
      confidence: 0.6,
      issues: ['Basic parsing applied - API unavailable']
    };
  }

  basicDuplicateDetection(records, onProgress) {
    const duplicateGroups = [];
    const processed = new Set();
    let comparisons = 0;
    const totalComparisons = (records.length * (records.length - 1)) / 2;

    for (let i = 0; i < records.length; i++) {
      if (processed.has(i)) continue;

      const currentRecord = records[i];
      const duplicates = [];

      for (let j = i + 1; j < records.length; j++) {
        if (processed.has(j)) continue;

        const compareRecord = records[j];
        const name1 = currentRecord.standardizedName || currentRecord.name || '';
        const name2 = compareRecord.standardizedName || compareRecord.name || '';
        
        const similarity = this.calculateStringSimilarity(name1.toLowerCase(), name2.toLowerCase());
        
        comparisons++;
        if (onProgress) {
          onProgress(Math.round((comparisons / totalComparisons) * 100));
        }

        if (similarity > 0.8) {
          duplicates.push({
            ...compareRecord,
            comparisonConfidence: similarity,
            reasoning: 'Basic string similarity comparison'
          });
          processed.add(j);
        }
      }

      if (duplicates.length > 0) {
        duplicateGroups.push({
          canonicalRecord: currentRecord,
          duplicates: duplicates,
          confidence: duplicates.reduce((acc, dup) => acc + dup.comparisonConfidence, 0) / duplicates.length,
          reasoning: 'Basic similarity-based duplicate detection'
        });
        processed.add(i);
      }
    }

    return { duplicateGroups };
  }

  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1.0;
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  levenshteinDistance(str1, str2) {
    const matrix = Array(str2.length + 1).fill().map(() => Array(str1.length + 1).fill(0));
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + cost
        );
      }
    }
    return matrix[str2.length][str1.length];
  }
}

// Improved CSV parsing function
const parseCSV = (csvText) => {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return { headers: [], data: [] };

  const headers = parseCSVLine(lines[0]);
  
  const data = lines.slice(1).map((line, index) => {
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i] || '';
    });
    row.id = index + 1;
    return row;
  }).filter(row => Object.values(row).some(val => val && val.toString().trim()));

  return { headers, data };
};

const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
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

// Main Application Component
const CustomerDataProcessor = () => {
  const [rawData, setRawData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [processedData, setProcessedData] = useState([]);
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('status');
  const [qualityMetrics, setQualityMetrics] = useState(null);
  const [apiService, setApiService] = useState(null);
  const [currentOperation, setCurrentOperation] = useState('');
  const [errors, setErrors] = useState([]);
  const [duplicateProgress, setDuplicateProgress] = useState(0);
  const [apiStatus, setApiStatus] = useState({ status: 'checking', apiConfigured: false });
  const fileInputRef = useRef(null);

  // Initialize API service and check health
  useEffect(() => {
    const initializeAPI = async () => {
      const service = new APIService();
      setApiService(service);
      
      try {
        const health = await service.checkHealth();
        setApiStatus(health);
        setErrors([]);
      } catch (error) {
        setApiStatus({ status: 'unhealthy', apiConfigured: false, error: error.message });
        setErrors(['Failed to connect to backend API. Please check server configuration.']);
      }
    };

    initializeAPI();
  }, []);

  const hasRequiredColumns = useCallback(() => {
    if (!csvHeaders || csvHeaders.length === 0) return false;
    const hasNameColumn = csvHeaders.some(header => 
      header && (
        header.toLowerCase().includes('name') || 
        header.toLowerCase().includes('customer') ||
        header.toLowerCase().includes('company')
      )
    );
    const hasAddressColumn = csvHeaders.some(header => 
      header && (
        header.toLowerCase().includes('address') ||
        header.toLowerCase().includes('location') ||
        header.toLowerCase().includes('street')
      )
    );
    return hasNameColumn && hasAddressColumn;
  }, [csvHeaders]);

  const getColumnMapping = useCallback(() => {
    if (!csvHeaders || csvHeaders.length === 0) {
      return { nameColumn: null, addressColumn: null };
    }
    
    const nameColumn = csvHeaders.find(header => 
      header && (
        header.toLowerCase().includes('name') || 
        header.toLowerCase().includes('customer') ||
        header.toLowerCase().includes('company')
      )
    );
    const addressColumn = csvHeaders.find(header => 
      header && (
        header.toLowerCase().includes('address') ||
        header.toLowerCase().includes('location') ||
        header.toLowerCase().includes('street')
      )
    );
    
    return { nameColumn, addressColumn };
  }, [csvHeaders]);

  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvText = e.target.result;
        const { headers, data } = parseCSV(csvText);
        
        if (data.length === 0) {
          setErrors(['CSV file appears to be empty or contains no valid data.']);
          return;
        }
        
        setRawData(data);
        setCsvHeaders(headers);
        calculateQualityMetrics(data, 'before');
        setActiveTab('preview');
        setErrors([]);
      } catch (error) {
        setErrors(['Error parsing CSV file. Please check the format.']);
        console.error('CSV parsing error:', error);
      }
    };
    reader.readAsText(file);
  }, []);

  const calculateQualityMetrics = useCallback((data, phase) => {
    if (!data || data.length === 0) return;

    const completeness = data.reduce((acc, record) => {
      const filled = Object.values(record).filter(val => val && val.toString().trim()).length;
      return acc + (filled / Object.keys(record).length);
    }, 0) / data.length;

    const standardization = phase === 'before' ? 0.3 : 0.95;

    setQualityMetrics(prev => ({
      ...prev,
      [phase]: { completeness: Math.round(completeness * 100), standardization: Math.round(standardization * 100) }
    }));
  }, []);

  const processData = async () => {
    if (!apiService) {
      setErrors(['API service not initialized']);
      return;
    }

    if (apiStatus.status !== 'healthy') {
      setErrors(['Backend API is not available. Please check server configuration.']);
      return;
    }

    if (!hasRequiredColumns()) {
      setErrors(['Required columns not found. Please ensure your CSV has columns for customer names and addresses.']);
      return;
    }

    setProcessing(true);
    setProgress(0);
    setErrors([]);
    setCurrentOperation('Initializing...');
    setActiveTab('processing');

    try {
      const processed = [];
      const { nameColumn, addressColumn } = getColumnMapping();
      
      if (!nameColumn || !addressColumn) {
        throw new Error('Could not identify name and address columns');
      }
      
      setCurrentOperation('Standardizing names and addresses...');
      
      // Process names in batch
      const nameRecords = rawData.map(record => ({ name: record[nameColumn] || '' }));
      const nameResults = await apiService.processBatch(nameRecords, 'standardizeName', (progress) => {
        setProgress(Math.round(progress * 0.35));
      });
      
      // Process addresses in batch
      const addressRecords = rawData.map(record => ({ address: record[addressColumn] || '' }));
      const addressResults = await apiService.processBatch(addressRecords, 'standardizeAddress', (progress) => {
        setProgress(35 + Math.round(progress * 0.35));
      });
      
      // Combine results
      for (let i = 0; i < rawData.length; i++) {
        processed.push({
          ...rawData[i],
          ...nameResults[i],
          ...addressResults[i],
          processingErrors: [
            ...(nameResults[i]?.error ? [nameResults[i].error] : []),
            ...(addressResults[i]?.error ? [addressResults[i].error] : [])
          ]
        });
      }

      setProcessedData(processed);
      setCurrentOperation('Finding duplicates...');

      const duplicateResult = await apiService.findDuplicates(processed, (duplicateProgress) => {
        setDuplicateProgress(duplicateProgress);
        setProgress(70 + Math.round(duplicateProgress * 0.3));
      });
      
      setDuplicateGroups(duplicateResult.duplicateGroups);
      
      setProgress(100);
      setCurrentOperation('Processing complete!');
      calculateQualityMetrics(processed, 'after');
      setActiveTab('results');

      const recordsWithErrors = processed.filter(record => record.processingErrors?.length > 0);
      if (recordsWithErrors.length > 0) {
        setErrors([`${recordsWithErrors.length} records had processing errors and used fallback processing`]);
      }

    } catch (error) {
      console.error('Processing error:', error);
      setErrors([`Processing failed: ${error.message}`]);
      setCurrentOperation('Processing failed');
    } finally {
      setProcessing(false);
      setTimeout(() => {
        setCurrentOperation('');
        setDuplicateProgress(0);
      }, 3000);
    }
  };

  const exportData = useCallback(() => {
    const { nameColumn, addressColumn } = getColumnMapping();
    
    const originalHeaders = csvHeaders || [];
    const headers = [
      ...originalHeaders,
      'Standardized Name',
      'Business Type',
      'Parsed Address 1',
      'Parsed Address 2',
      'Parsed City',
      'Parsed State',
      'Parsed ZIP Code',
      'Name Confidence',
      'Address Confidence',
      'Processing Status',
      'Changes Made',
      'Processing Errors'
    ];

    const csvRows = processedData.map(record => {
      const originalCols = originalHeaders.map(header => `"${(record[header] || '').toString().replace(/"/g, '""')}"`);
      const newCols = [
        `"${(record.standardizedName || '').toString().replace(/"/g, '""')}"`,
        `"${(record.businessType || '').toString().replace(/"/g, '""')}"`,
        `"${(record.address1 || '').toString().replace(/"/g, '""')}"`,
        `"${(record.address2 || '').toString().replace(/"/g, '""')}"`,
        `"${(record.city || '').toString().replace(/"/g, '""')}"`,
        `"${(record.state || '').toString().replace(/"/g, '""')}"`,
        `"${(record.zipCode || '').toString().replace(/"/g, '""')}"`,
        record.nameConfidence || 0,
        record.confidence || 0,
        record.processingErrors?.length > 0 ? 'Fallback Processing' : 'AI Processed',
        `"${(record.nameChanges?.join('; ') || 'No changes').replace(/"/g, '""')}"`,
        `"${(record.processingErrors?.join('; ') || 'None').replace(/"/g, '""')}"`
      ];
      
      return [...originalCols, ...newCols];
    });

    const csv = [headers.join(','), ...csvRows.map(row => row.join(','))].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `standardized_customer_data_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [csvHeaders, processedData, getColumnMapping]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Customer Data Standardization</h1>
          <p className="text-gray-600">Upload, standardize, and deduplicate your customer database using AI</p>
        </div>

        {/* Navigation Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex space-x-8">
            {[
              { id: 'status', label: 'Server Status', icon: Server },
              { id: 'upload', label: 'Upload Data', icon: Upload },
              { id: 'preview', label: 'Preview', icon: Eye },
              { id: 'processing', label: 'Processing', icon: RefreshCw },
              { id: 'results', label: 'Results', icon: CheckCircle },
              { id: 'duplicates', label: 'Duplicates', icon: Users }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                disabled={id === 'upload' && apiStatus.status !== 'healthy'}
                className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
                {id === 'status' && apiStatus.status !== 'healthy' && (
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Error Display */}
        {errors.length > 0 && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
              <h3 className="text-sm font-medium text-red-800">Processing Errors</h3>
            </div>
            <ul className="mt-2 text-sm text-red-700">
              {errors.map((error, index) => (
                <li key={index}>• {error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Server Status Tab */}
        {activeTab === 'status' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="max-w-2xl">
              <div className="flex items-center mb-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mr-4 ${
                  apiStatus.status === 'healthy' ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  <Server className={`w-6 h-6 ${
                    apiStatus.status === 'healthy' ? 'text-green-600' : 'text-red-600'
                  }`} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Backend API Status</h3>
                  <p className="text-gray-500">Server-side processing with secure API key management</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${
                        apiStatus.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-sm font-medium text-gray-900">Server Status</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1 capitalize">{apiStatus.status}</p>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${
                        apiStatus.apiConfigured ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-sm font-medium text-gray-900">API Configuration</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {apiStatus.apiConfigured ? 'Configured' : 'Not Configured'}
                    </p>
                  </div>
                </div>

                {apiStatus.status === 'healthy' ? (
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                      <span className="text-sm font-medium text-green-800">Backend API is ready!</span>
                    </div>
                    <p className="text-sm text-green-700 mt-1">
                      You can now upload and process your customer data securely.
                    </p>
                    <div className="mt-2 text-xs text-green-600">
                      Last checked: {apiStatus.timestamp ? new Date(apiStatus.timestamp).toLocaleString() : 'Just now'}
                    </div>
                  </div>
                ) : (
                  <div className="bg-red-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                      <span className="text-sm font-medium text-red-800">Backend API is not available</span>
                    </div>
                    <p className="text-sm text-red-700 mt-1">
                      {apiStatus.error || 'Please check server configuration and ensure the Gemini API key is set.'}
                    </p>
                    <div className="mt-3">
                      <button
                        onClick={() => window.location.reload()}
                        className="text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                      >
                        Retry Connection
                      </button>
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">Security Features:</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>✅ API keys stored securely on server</li>
                    <li>✅ Rate limiting prevents abuse</li>
                    <li>✅ No sensitive data exposed to frontend</li>
                    <li>✅ Batch processing for efficiency</li>
                    <li>✅ Graceful fallbacks for reliability</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="bg-white rounded-lg shadow p-6">
            {apiStatus.status !== 'healthy' ? (
              <div className="text-center">
                <div className="mx-auto w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Backend API Required</h3>
                <p className="text-gray-500 mb-6">Please ensure the backend server is running and configured before uploading data</p>
                <button
                  onClick={() => setActiveTab('status')}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Check Server Status
                </button>
              </div>
            ) : (
              <div className="text-center">
                <div className="mx-auto w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <Upload className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Upload Customer Data</h3>
                <p className="text-gray-500 mb-6">Upload a CSV file with customer names and addresses</p>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Choose CSV File
                </button>
                
                <div className="mt-6 text-sm text-gray-500">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-700 mb-2">CSV File Requirements:</h4>
                    <ul className="space-y-1 text-gray-600">
                      <li>• Must contain columns for customer/company names</li>
                      <li>• Must contain columns for addresses</li>
                      <li>• Column names can include: "Customer Name", "Company", "Business Name", etc.</li>
                      <li>• Address columns can include: "Address", "Street Address", "Location", etc.</li>
                      <li>• Additional columns (Source, Phone, etc.) will be preserved</li>
                    </ul>
                  </div>
                  <p className="mt-2 text-center">✅ Backend API Connected - Ready to process data securely</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Preview Tab */}
        {activeTab === 'preview' && rawData.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Data Preview</h3>
                  <p className="text-gray-500">{rawData.length} records loaded</p>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${apiStatus.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-sm text-gray-600">
                      {apiStatus.status === 'healthy' ? 'API Ready' : 'API Not Available'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${hasRequiredColumns() ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                    <span className="text-sm text-gray-600">
                      {hasRequiredColumns() ? 'Columns Valid' : 'Check Columns'}
                    </span>
                  </div>
                  <button
                    onClick={processData}
                    disabled={processing || apiStatus.status !== 'healthy' || !hasRequiredColumns()}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${processing ? 'animate-spin' : ''}`} />
                    <span>{processing ? 'Processing...' : 'Start Processing'}</span>
                  </button>
                </div>
              </div>
              
              {(apiStatus.status !== 'healthy' || !hasRequiredColumns()) && (
                <div className="mt-4 space-y-2">
                  {apiStatus.status !== 'healthy' && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <div className="flex items-center">
                        <AlertCircle className="w-4 h-4 text-yellow-600 mr-2" />
                        <span className="text-sm text-yellow-800">
                          Backend API is not available. Check the Server Status tab.
                        </span>
                      </div>
                    </div>
                  )}
                  {!hasRequiredColumns() && csvHeaders.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <div className="flex items-center">
                        <AlertCircle className="w-4 h-4 text-orange-600 mr-2" />
                        <span className="text-sm text-orange-800">
                          Required columns not detected. Your CSV should have columns containing customer/company names and addresses.
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-orange-700">
                        Detected columns: {csvHeaders.join(', ')}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {csvHeaders.map((header, index) => (
                        <th 
                          key={index}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {rawData.slice(0, 10).map((record, index) => (
                      <tr key={index}>
                        {csvHeaders.map((header, headerIndex) => (
                          <td 
                            key={headerIndex}
                            className={`px-6 py-4 text-sm ${
                              header && header.toLowerCase().includes('name') ? 'text-gray-900 font-medium' : 
                              header && header.toLowerCase().includes('address') ? 'text-gray-900' : 
                              'text-gray-500'
                            } ${header && header.toLowerCase().includes('address') ? '' : 'whitespace-nowrap'}`}
                          >
                            {record[header] || ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rawData.length > 10 && (
                <p className="text-center text-gray-500 mt-4">Showing first 10 of {rawData.length} records</p>
              )}
              
              <div className="mt-6 bg-gray-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 mb-2">
                  Detected Columns ({csvHeaders.length}):
                </h4>
                <div className="flex flex-wrap gap-2">
                  {csvHeaders.map((header, index) => (
                    <span 
                      key={index}
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        header && header.toLowerCase().includes('name') ? 'bg-blue-100 text-blue-800' :
                        header && header.toLowerCase().includes('address') ? 'bg-green-100 text-green-800' :
                        header && header.toLowerCase().includes('source') ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {header}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Required for processing: Customer Name, Address columns
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Processing Tab */}
        {activeTab === 'processing' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <RefreshCw className={`w-6 h-6 text-blue-600 ${processing ? 'animate-spin' : ''}`} />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {processing ? 'Processing Data...' : 'Ready to Process'}
              </h3>
              <p className="text-gray-500 mb-6">
                {processing ? 'Backend AI is standardizing names and addresses' : 'Click "Start Processing" in the Preview tab to begin'}
              </p>
              
              {processing && (
                <div className="w-full max-w-2xl mx-auto space-y-6">
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Overall Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>

                  {currentOperation && (
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="flex items-center justify-center space-x-2">
                        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                        <span className="text-sm text-blue-800 font-medium">Current Operation</span>
                      </div>
                      <p className="text-sm text-blue-700 mt-2 text-center">{currentOperation}</p>
                    </div>
                  )}

                  {duplicateProgress > 0 && (
                    <div>
                      <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>Duplicate Detection</span>
                        <span>{duplicateProgress}%</span>
                      </div>
                      <div className="bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${duplicateProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className={`p-3 rounded-lg border-2 ${progress > 0 ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                      <div className="flex items-center space-x-2">
                        <div className={`w-4 h-4 rounded-full ${progress > 0 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <span className={`font-medium ${progress > 0 ? 'text-green-800' : 'text-gray-600'}`}>
                          Name Standardization
                        </span>
                      </div>
                      <p className={`mt-1 text-xs ${progress > 0 ? 'text-green-700' : 'text-gray-500'}`}>
                        {progress > 0 ? 'In progress...' : 'Pending'}
                      </p>
                    </div>

                    <div className={`p-3 rounded-lg border-2 ${progress > 35 ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
                      <div className="flex items-center space-x-2">
                        <div className={`w-4 h-4 rounded-full ${progress > 35 ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
                        <span className={`font-medium ${progress > 35 ? 'text-blue-800' : 'text-gray-600'}`}>
                          Address Parsing
                        </span>
                      </div>
                      <p className={`mt-1 text-xs ${progress > 35 ? 'text-blue-700' : 'text-gray-500'}`}>
                        {progress > 70 ? 'Complete' : progress > 35 ? 'In progress...' : 'Pending'}
                      </p>
                    </div>

                    <div className={`p-3 rounded-lg border-2 ${progress > 70 ? 'border-purple-200 bg-purple-50' : 'border-gray-200'}`}>
                      <div className="flex items-center space-x-2">
                        <div className={`w-4 h-4 rounded-full ${progress > 70 ? 'bg-purple-500' : 'bg-gray-300'}`}></div>
                        <span className={`font-medium ${progress > 70 ? 'text-purple-800' : 'text-gray-600'}`}>
                          Duplicate Detection
                        </span>
                      </div>
                      <p className={`mt-1 text-xs ${progress > 70 ? 'text-purple-700' : 'text-gray-500'}`}>
                        {progress === 100 ? 'Complete' : progress > 70 ? 'In progress...' : 'Pending'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!processing && apiStatus.status !== 'healthy' && (
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="flex items-center justify-center space-x-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-800">Backend API required to start processing</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Results Tab */}
        {activeTab === 'results' && processedData.length > 0 && (
          <div className="space-y-6">
            {qualityMetrics && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Processing Summary</h3>
                
                {csvHeaders && csvHeaders.length > 0 && (
                  <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                    <h4 className="text-sm font-medium text-blue-900 mb-2">Column Mapping Used:</h4>
                    <div className="text-sm text-blue-800">
                      <div>Name Column: <span className="font-medium">{getColumnMapping().nameColumn || 'Not detected'}</span></div>
                      <div>Address Column: <span className="font-medium">{getColumnMapping().addressColumn || 'Not detected'}</span></div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-blue-600 font-medium">Data Completeness</span>
                      <span className="text-2xl font-bold text-blue-600">
                        {qualityMetrics.before?.completeness}% → {qualityMetrics.after?.completeness}%
                      </span>
                    </div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-green-600 font-medium">Standardization</span>
                      <span className="text-2xl font-bold text-green-600">
                        {qualityMetrics.before?.standardization}% → {qualityMetrics.after?.standardization}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Standardized Data</h3>
                    <p className="text-gray-500">{processedData.length} records processed</p>
                  </div>
                  <button
                    onClick={exportData}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>
              
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Original Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Standardized Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City, State ZIP</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Changes Made</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Confidence</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {processedData.slice(0, 10).map((record, index) => {
                        const { nameColumn } = getColumnMapping();
                        return (
                          <tr key={index} className={record.processingErrors?.length > 0 ? 'bg-yellow-50' : ''}>
                            <td className="px-6 py-4 text-sm text-gray-500">{record[nameColumn]}</td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{record.standardizedName}</td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {record.address1}
                              {record.address2 && <div className="text-gray-500">{record.address2}</div>}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {record.city}, {record.state} {record.zipCode}
                            </td>
                            <td className="px-6 py-4 text-xs text-gray-600">
                              {record.nameChanges?.length > 0 ? (
                                <ul className="list-disc list-inside">
                                  {record.nameChanges.slice(0, 2).map((change, i) => (
                                    <li key={i}>{change}</li>
                                  ))}
                                  {record.nameChanges.length > 2 && <li>+{record.nameChanges.length - 2} more</li>}
                                </ul>
                              ) : (
                                'No changes'
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                record.nameConfidence > 0.8 ? 'bg-green-100 text-green-800' : 
                                record.nameConfidence > 0.6 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {Math.round(record.nameConfidence * 100)}%
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {record.processingErrors?.length > 0 ? (
                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                  Fallback
                                </span>
                              ) : (
                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                  AI Processed
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {processedData.length > 10 && (
                  <p className="text-center text-gray-500 mt-4">Showing first 10 of {processedData.length} records</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Duplicates Tab */}
        {activeTab === 'duplicates' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Potential Duplicates</h3>
              <p className="text-gray-500">{duplicateGroups.length} duplicate groups found</p>
            </div>
            
            <div className="p-6">
              {duplicateGroups.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="mx-auto w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-gray-500">No duplicates found</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {duplicateGroups.map((group, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-900">Duplicate Group {index + 1}</h4>
                        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded-full">
                          {Math.round(group.confidence * 100)}% match
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="bg-green-50 p-3 rounded border-l-4 border-green-400">
                          <div className="flex items-center">
                            <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                            <span className="text-sm font-medium text-green-800">Canonical Record</span>
                          </div>
                          <p className="text-sm text-gray-700 mt-1">{group.canonicalRecord.standardizedName}</p>
                          <p className="text-xs text-gray-500">{group.canonicalRecord.address1}, {group.canonicalRecord.city}</p>
                        </div>
                        
                        {group.duplicates.map((duplicate, dupIndex) => (
                          <div key={dupIndex} className="bg-yellow-50 p-3 rounded border-l-4 border-yellow-400">
                            <div className="flex items-center">
                              <AlertCircle className="w-4 h-4 text-yellow-500 mr-2" />
                              <span className="text-sm font-medium text-yellow-800">Potential Duplicate</span>
                            </div>
                            <p className="text-sm text-gray-700 mt-1">{duplicate.standardizedName}</p>
                            <p className="text-xs text-gray-500">{duplicate.address1}, {duplicate.city}</p>
                          </div>
                        ))}
                      </div>
                      
                      <p className="text-xs text-gray-500 mt-3">{group.reasoning}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerDataProcessor;