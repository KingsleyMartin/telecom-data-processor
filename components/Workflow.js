"use client";

import React, { useState, useCallback } from 'react';
import { Upload, Download, FileText, Users, MapPin, AlertCircle, CheckCircle, X, ArrowRight, Package, Phone, Wifi, DollarSign, Calendar, Search } from 'lucide-react';

const WorkflowApp = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [orderFile, setOrderFile] = useState(null);
  const [serviceFile, setServiceFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  
  // Column mapping for service file
  const [columnMapping, setColumnMapping] = useState({
    customerColumn: '',
    productColumn: '',
    providerColumn: '',
    addressColumn: ''
  });
  const [showColumnMapping, setShowColumnMapping] = useState(false);
  const [fileHeaders, setFileHeaders] = useState([]);
  
  // Step 1 results - extracted companies and locations
  const [extractedData, setExtractedData] = useState({
    customers: [],
    locations: []
  });
  
  // Step 2 results - companies with services (matches TelecomServices structure)
  const [enrichedData, setEnrichedData] = useState({
    matches: [],
    unmatched: []
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');

  // Helper function to clean and normalize text
  const cleanText = (text) => {
    if (!text || text === null || text === undefined) return '';
    return String(text).trim();
  };

  // Parse CSV content
  const parseCSV = (content) => {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { data: [], headers: [] };
    
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
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
  };

  // Extract customer and location data from parsed CSV (Step 1)
  const extractCompanyData = (parsedData) => {
    const customers = new Map();
    const locations = new Map();
    
    parsedData.data.forEach(row => {
      // Extract customer name
      let customerName = '';
      if (row['Customer']) customerName = cleanText(row['Customer']);
      else if (row['Customer Name']) customerName = cleanText(row['Customer Name']);
      
      if (!customerName) return;
      
      // Extract address components
      let address1 = '';
      let address2 = '';
      let city = '';
      let state = '';
      
      // Try different address field combinations
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
      
      // Extract city and state
      city = cleanText(row['City'] || '');
      state = cleanText(row['State'] || '');
      
      // Handle combined city/state/zip fields
      if (!city && !state && row['Location City State Zip']) {
        const cityStateZip = cleanText(row['Location City State Zip']);
        const parts = cityStateZip.split(' ');
        if (parts.length >= 3) {
          state = parts[parts.length - 2];
          city = parts.slice(0, -2).join(' ');
        }
      }
      
      // Only process if we have both customer name and address
      if (customerName && address1) {
        const customerKey = customerName.toUpperCase();
        
        // Customer processing - only add first occurrence
        if (!customers.has(customerKey)) {
          customers.set(customerKey, {
            Customer: customerName,
            'Address 1': address1,
            'URL (Google)': '',
            'Address 2': address2,
            City: city,
            State: state
          });
        }
        
        // Location processing - unique combination of customer and address
        const locationKey = `${customerKey}_${address1.toUpperCase()}`;
        if (!locations.has(locationKey)) {
          locations.set(locationKey, {
            Customer: customerName,
            'Address 1': address1,
            'Address 2': address2,
            City: city,
            State: state,
            'Country (Google)': ''
          });
        }
      }
    });
    
    return {
      customers: Array.from(customers.values()),
      locations: Array.from(locations.values())
    };
  };

  // Enrich locations with service data (Step 2) - matches TelecomServices logic
  const enrichWithServices = (locations, serviceData) => {
    // Normalize company names for matching
    const normalizeCompanyName = (name) => {
      if (!name) return '';
      return name.toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim();
    };

    // Use dynamic column mapping
    const customerCol = columnMapping.customerColumn || 'Customer';
    const productCol = columnMapping.productColumn || 'Product';
    const providerCol = columnMapping.providerColumn || 'Provider';

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

    // Match locations with services
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
  };

  const arrayToCSV = (data) => {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [];
    
    // Add headers
    csvRows.push(headers.map(header => `"${header}"`).join(','));
    
    // Add data rows
    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header] || '';
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    });
    
    return csvRows.join('\n');
  };

  // Handle file uploads
  const handleOrderFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (file && file.type === 'text/csv') {
      setOrderFile(file);
      setError('');
    } else {
      setError('Please upload a valid CSV file');
    }
  }, []);

  const handleServiceFileUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'text/csv') {
      setServiceFile(file);
      setError('');

      // Read file headers for column mapping
      try {
        const fileContent = await file.text();
        const parsed = parseCSV(fileContent);
        setFileHeaders(parsed.headers || []);

        // Auto-detect common column names
        const headers = parsed.headers || [];
        const productColumn = headers.find(h => 
          h.toLowerCase().includes('product') || 
          h.toLowerCase().includes('service') ||
          h.toLowerCase().includes('description')
        ) || '';
        const customerColumn = headers.find(h => 
          h.toLowerCase().includes('customer') || 
          h.toLowerCase().includes('client') ||
          h.toLowerCase().includes('company')
        ) || '';
        const providerColumn = headers.find(h => 
          h.toLowerCase().includes('provider') || 
          h.toLowerCase().includes('vendor') ||
          h.toLowerCase().includes('supplier') ||
          h.toLowerCase().includes('carrier')
        ) || '';

        setColumnMapping({
          productColumn,
          customerColumn,
          providerColumn,
          addressColumn: ''
        });

      } catch (error) {
        console.error('Error reading file headers:', error);
      }
    } else {
      setError('Please upload a valid CSV file');
    }
  }, []);

  // Step 1: Process order file to extract companies
  const processStep1 = async () => {
    if (!orderFile) {
      setError('Please upload an Orders CSV file');
      return;
    }
    
    setProcessing(true);
    setError('');
    
    try {
      const ordersContent = await orderFile.text();
      const ordersData = parseCSV(ordersContent);
      const extracted = extractCompanyData(ordersData);
      
      setExtractedData(extracted);
      setCurrentStep(2);
    } catch (err) {
      setError(`Error processing file: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  // Step 2: Enrich with service data
  const processStep2 = async () => {
    if (!serviceFile) {
      setError('Please upload a Services CSV file');
      return;
    }

    if (!columnMapping.customerColumn || !columnMapping.productColumn) {
      setShowColumnMapping(true);
      return;
    }
    
    setProcessing(true);
    setError('');
    
    try {
      const serviceContent = await serviceFile.text();
      const serviceData = parseCSV(serviceContent);
      const enriched = enrichWithServices(extractedData.locations, serviceData);
      
      setEnrichedData(enriched);
      setCurrentStep(3);
    } catch (err) {
      setError(`Error processing file: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  // Download CSV file
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

  // Download enriched data as CSV (matches TelecomServices export)
  const downloadEnrichedCSV = () => {
    // Create CSV headers
    const headers = [
      'Company Name',
      'Address',
      'City',
      'State',
      'Service Product',
      'Provider',
      'Quantity',
      'Net Billed',
      'Agent Commission',
      'Install Date',
      'Invoice Date',
      'Has Services'
    ];

    // Create CSV rows
    const rows = [];
    
    // Add matched locations with services
    enrichedData.matches.forEach(location => {
      if (location.services && location.services.length > 0) {
        location.services.forEach(service => {
          rows.push([
            location.customer,
            location.address,
            location.city,
            location.state,
            service.product || '',
            service.provider || '',
            service.qty || '',
            service.netBilled || '',
            service.agentComm || '',
            service.installDate || '',
            service.invoiceDate || '',
            'Yes'
          ]);
        });
      } else {
        rows.push([
          location.customer,
          location.address,
          location.city,
          location.state,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          'No'
        ]);
      }
    });

    // Add unmatched locations
    enrichedData.unmatched.forEach(location => {
      rows.push([
        location.customer,
        location.address,
        location.city,
        location.state,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'No'
      ]);
    });

    // Convert to CSV format
    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        row.map(field => {
          // Escape fields that contain commas, quotes, or newlines
          const stringField = String(field || '');
          if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            return `"${stringField.replace(/"/g, '""')}"`;
          }
          return stringField;
        }).join(',')
      )
    ].join('\n');

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `telecom_services_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reset application
  const reset = () => {
    setCurrentStep(1);
    setOrderFile(null);
    setServiceFile(null);
    setExtractedData({ customers: [], locations: [] });
    setEnrichedData({ matches: [], unmatched: [] });
    setError('');
    setSearchTerm('');
    setSelectedFilter('all');
    setColumnMapping({
      customerColumn: '',
      productColumn: '',
      providerColumn: '',
      addressColumn: ''
    });
    setShowColumnMapping(false);
    setFileHeaders([]);
    // Clear file inputs
    const inputs = document.querySelectorAll('input[type="file"]');
    inputs.forEach(input => input.value = '');
  };

  const getServiceIcon = (product) => {
    if (!product) return <Package className="w-4 h-4" />;
    const productLower = product.toLowerCase();
    if (productLower.includes('internet') || productLower.includes('fiber')) {
      return <Wifi className="w-4 h-4" />;
    }
    if (productLower.includes('phone') || productLower.includes('voice')) {
      return <Phone className="w-4 h-4" />;
    }
    return <Package className="w-4 h-4" />;
  };

  const formatCurrency = (amount) => {
    if (!amount || amount === 0) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const filteredData = () => {
    let dataToFilter = selectedFilter === 'matched' ? enrichedData.matches : 
                      selectedFilter === 'unmatched' ? enrichedData.unmatched.map(item => ({...item, services: []})) :
                      [...enrichedData.matches, ...enrichedData.unmatched.map(item => ({...item, services: []}))];
    
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
  };

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">Data Migration Workflow</h1>
        <p className="text-gray-600">
          Two-step process: Extract company data from orders, then enrich with service information
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8 flex items-center justify-center">
        <div className="flex items-center space-x-4">
          <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${currentStep >= 1 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'}`}>
            <Users className="w-5 h-5" />
            <span className="font-medium">1. Extract Companies</span>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-400" />
          <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${currentStep >= 2 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'}`}>
            <Package className="w-5 h-5" />
            <span className="font-medium">2. Add Services</span>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-400" />
          <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${currentStep >= 3 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
            <Download className="w-5 h-5" />
            <span className="font-medium">3. Export Results</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
            <span className="text-red-700">{error}</span>
          </div>
        </div>
      )}

      {/* Column Mapping Modal */}
      {showColumnMapping && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Configure Column Mapping</h3>
            <p className="text-gray-600 mb-6">
              Select which columns contain the key information for matching services to locations.
            </p>
            
            <div className="space-y-6">
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Service File Column Configuration</h4>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Customer/Company Column *
                    </label>
                    <select
                      value={columnMapping.customerColumn}
                      onChange={(e) => setColumnMapping(prev => ({...prev, customerColumn: e.target.value}))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select column...</option>
                      {fileHeaders.map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Product/Service Description Column *
                    </label>
                    <select
                      value={columnMapping.productColumn}
                      onChange={(e) => setColumnMapping(prev => ({...prev, productColumn: e.target.value}))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select column...</option>
                      {fileHeaders.map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Provider/Vendor Column (Optional)
                    </label>
                    <select
                      value={columnMapping.providerColumn}
                      onChange={(e) => setColumnMapping(prev => ({...prev, providerColumn: e.target.value}))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select column...</option>
                      {fileHeaders.map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Available Columns
                    </label>
                    <div className="p-3 bg-gray-50 rounded-lg max-h-24 overflow-y-auto">
                      <div className="text-xs text-gray-600 space-y-1">
                        {fileHeaders.map((header, index) => (
                          <div key={index} className="truncate">{header}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {columnMapping.customerColumn && columnMapping.productColumn && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-800 text-sm">
                      <strong>Ready to process:</strong> Will match companies using "{columnMapping.customerColumn}" 
                      and extract services from "{columnMapping.productColumn}"
                      {columnMapping.providerColumn && ` with provider info from "${columnMapping.providerColumn}"`}.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowColumnMapping(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowColumnMapping(false);
                  if (columnMapping.customerColumn && columnMapping.productColumn) {
                    processStep2();
                  }
                }}
                disabled={!columnMapping.customerColumn || !columnMapping.productColumn}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Apply & Process
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Upload Orders File and Extract Companies */}
      {currentStep === 1 && (
        <div className="bg-white rounded-lg shadow-sm border p-8 mb-6">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Step 1: Extract Company Data</h2>
          <p className="text-gray-600 mb-6">
            Upload your orders/customers CSV file to extract unique company names and addresses.
          </p>
          
          <div className="max-w-md mx-auto mb-6">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-blue-400 transition-colors">
              <div className="text-center">
                <Upload className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                <label className="cursor-pointer">
                  <span className="text-xl font-medium text-gray-700">Upload Orders/Customer File</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleOrderFileUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-sm text-gray-500 mt-2">CSV format with Customer, Address, City, State columns</p>
                {orderFile && (
                  <div className="mt-4 flex items-center justify-center text-green-600">
                    <CheckCircle className="h-5 w-5 mr-2" />
                    <span className="text-sm">{orderFile.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

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

      {/* Step 2: Upload Services File and Enrich Data */}
      {currentStep === 2 && (
        <div className="space-y-6">
          {/* Step 1 Results Summary */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-green-800 mb-4">
              Step 1 Complete!
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center">
                <Users className="h-6 w-6 text-green-600 mr-3" />
                <span className="text-green-700">
                  <strong>{extractedData.customers.length}</strong> unique customers extracted
                </span>
              </div>
              <div className="flex items-center">
                <MapPin className="h-6 w-6 text-green-600 mr-3" />
                <span className="text-green-700">
                  <strong>{extractedData.locations.length}</strong> unique locations extracted
                </span>
              </div>
            </div>
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
            </div>
          </div>

          {/* Step 2 Upload */}
          <div className="bg-white rounded-lg shadow-sm border p-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Step 2: Add Service Information</h2>
            <p className="text-gray-600 mb-6">
              Upload your services/commissions CSV file to match services with the extracted company locations.
            </p>
            
            <div className="max-w-md mx-auto mb-6">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-blue-400 transition-colors">
                <div className="text-center">
                  <Upload className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                  <label className="cursor-pointer">
                    <span className="text-xl font-medium text-gray-700">Upload Services/Commission File</span>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleServiceFileUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-sm text-gray-500 mt-2">CSV format with Customer, Product/Service, Provider columns</p>
                  {serviceFile && (
                    <div className="mt-4 flex items-center justify-center text-green-600">
                      <CheckCircle className="h-5 w-5 mr-2" />
                      <span className="text-sm">{serviceFile.name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={() => setShowColumnMapping(true)}
                disabled={!serviceFile}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-8 rounded-lg transition-colors mr-4"
              >
                Configure Columns
              </button>
              
              <button
                onClick={processStep2}
                disabled={!serviceFile || processing || !columnMapping.customerColumn || !columnMapping.productColumn}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-3 px-8 rounded-lg transition-colors mr-4"
              >
                {processing ? 'Processing...' : 'Enrich with Services'}
              </button>
              
              <button
                onClick={() => setCurrentStep(1)}
                className="bg-gray-500 hover:bg-gray-600 text-white font-medium py-3 px-8 rounded-lg transition-colors"
              >
                Back to Step 1
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Results and Export */}
      {currentStep === 3 && (
        <div className="min-h-screen bg-gray-50">
          <div className="bg-white shadow-sm border-b">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Telecom Services Directory</h1>
                  <p className="mt-2 text-gray-600">
                    Company locations and their associated telecom services
                  </p>
                </div>
                <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={downloadEnrichedCSV}
                    disabled={enrichedData.matches.length === 0 && enrichedData.unmatched.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
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
                    <option value="all">All Locations ({enrichedData.matches.length + enrichedData.unmatched.length})</option>
                    <option value="matched">With Services ({enrichedData.matches.length})</option>
                    <option value="unmatched">No Services ({enrichedData.unmatched.length})</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-600">
                  Data Source: Workflow Processing
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={reset}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                >
                  Start New Workflow
                </button>
              </div>
            </div>

            <div className="grid gap-6">
              {filteredData().map((item, index) => (
                <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <div className="p-6">
                    <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start">
                      <div className="flex-1">
                        <div className="flex items-start gap-3">
                          <MapPin className="w-5 h-5 text-gray-400 mt-1 flex-shrink-0" />
                          <div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-1">
                              {item.customer}
                            </h3>
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
                  </div>
                </div>
              ))}
              
              {filteredData().length === 0 && (
                <div className="text-center py-12">
                  <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
                  <p className="text-gray-600">Try adjusting your search terms or filters.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowApp;