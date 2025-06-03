"use client";

import React, { useState, useCallback } from 'react';
import { Upload, Download, FileText, Users, MapPin, AlertCircle, CheckCircle, X, ArrowRight, Package, Phone, Wifi, DollarSign, Calendar, Search, ChevronLeft, Settings, Check, Hash, Globe, Zap, Plus } from 'lucide-react';

const WorkflowApp = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [orderFile, setOrderFile] = useState(null);
  const [serviceFile, setServiceFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  
  // Enhanced field mapping state
  const [ordersData, setOrdersData] = useState({ headers: [], data: [] });
  const [commissionsData, setCommissionsData] = useState({ headers: [], data: [] });
  const [fullOrdersData, setFullOrdersData] = useState({ headers: [], data: [] });
  const [fullCommissionsData, setFullCommissionsData] = useState({ headers: [], data: [] });
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

  // Dynamic field mappings
  const [dynamicMappings, setDynamicMappings] = useState([
    { id: 'customer', label: 'CUSTOMER', ordersField: 'customerField', commissionsField: 'customerField', required: true, icon: 'users' },
    { id: 'address', label: 'ADDRESS', ordersField: 'locationField', commissionsField: 'addressField', required: false, icon: 'map-pin' },
    { id: 'service', label: 'SERVICE', ordersField: 'productField', commissionsField: 'serviceField', required: true, icon: 'package' },
    { id: 'provider', label: 'PROVIDER', ordersField: 'providerField', commissionsField: 'providerField', required: false, icon: 'globe' },
    { id: 'account', label: 'ACCOUNT', ordersField: 'accountField', commissionsField: 'accountField', required: false, icon: 'hash' }
  ]);
  const [nextMappingId, setNextMappingId] = useState(6);

  // Export field selection state
  const [exportFields, setExportFields] = useState({
    orders: new Set(),
    commissions: new Set()
  });
  const [showExportConfig, setShowExportConfig] = useState(false);
  
  // Legacy column mapping for compatibility
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

  // Parse CSV content with option for full parsing or sample only
  const parseCSV = (content, fullParse = false) => {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { data: [], headers: [] };
    
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const data = [];
    
    // Determine how many rows to process
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
  };

  // Auto-detect field mappings based on common patterns
  const autoDetectFieldMappings = (headers, fileType) => {
    const detectedMapping = {};

    if (fileType === 'orders') {
      detectedMapping.customerField = findField(headers, ['customer', 'client', 'company']);
      detectedMapping.locationField = findField(headers, ['location', 'address', 'site']);
      detectedMapping.accountField = findField(headers, ['account', 'billing account', 'account number']);
      detectedMapping.orderIdField = findField(headers, ['order id', 'order', 'order number']);
      detectedMapping.providerField = findField(headers, ['provider', 'supplier', 'vendor']);
      detectedMapping.productField = findField(headers, ['product', 'service', 'description']);
    } else {
      detectedMapping.customerField = findField(headers, ['customer', 'client', 'company']);
      detectedMapping.providerCustomerField = findField(headers, ['provider customer', 'account name', 'billing name']);
      detectedMapping.addressField = findField(headers, ['address', 'site address', 'location']);
      detectedMapping.accountField = findField(headers, ['account', 'account number', 'billing account']);
      detectedMapping.orderIdField = findField(headers, ['order id', 'order', 'order number']);
      detectedMapping.providerField = findField(headers, ['provider', 'supplier', 'vendor']);
      detectedMapping.serviceField = findField(headers, ['service', 'product', 'description']);
      detectedMapping.amountField = findField(headers, ['amount', 'net billed', 'revenue', 'commission']);
    }

    setFieldMapping(prev => ({
      ...prev,
      [fileType]: { ...prev[fileType], ...detectedMapping }
    }));
  };

  const findField = (headers, patterns) => {
    return headers.find(header => 
      patterns.some(pattern => 
        header.toLowerCase().includes(pattern.toLowerCase())
      )
    ) || '';
  };

  // Toggle export field selection
  const toggleExportField = (fileType, fieldName) => {
    setExportFields(prev => {
      const newSet = new Set(prev[fileType]);
      if (newSet.has(fieldName)) {
        newSet.delete(fieldName);
      } else {
        newSet.add(fieldName);
      }
      return {
        ...prev,
        [fileType]: newSet
      };
    });
  };

  // Add new dynamic field mapping
  const addFieldMapping = () => {
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
    
    // Add the new fields to fieldMapping state
    setFieldMapping(prev => ({
      orders: { ...prev.orders, [newMapping.ordersField]: '' },
      commissions: { ...prev.commissions, [newMapping.commissionsField]: '' }
    }));
  };

  // Remove dynamic field mapping
  const removeFieldMapping = (mappingId) => {
    const mappingToRemove = dynamicMappings.find(m => m.id === mappingId);
    if (!mappingToRemove || mappingToRemove.required) return;
    
    setDynamicMappings(prev => prev.filter(m => m.id !== mappingId));
    
    // Remove the fields from fieldMapping state
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
  };

  // Update dynamic mapping label
  const updateMappingLabel = (mappingId, newLabel) => {
    setDynamicMappings(prev => 
      prev.map(mapping => 
        mapping.id === mappingId 
          ? { ...mapping, label: newLabel.toUpperCase() }
          : mapping
      )
    );
  };

  // Get icon component for mapping
  const getMappingIcon = (iconType) => {
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

  // Enrich locations with service data using enhanced field mapping
  const enrichWithServices = (locations, serviceData) => {
    // Normalize company names for matching
    const normalizeCompanyName = (name) => {
      if (!name) return '';
      return name.toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim();
    };

    // Use enhanced field mapping
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

  // Handle file uploads with enhanced parsing
  const handleOrderFileUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file || file.type !== 'text/csv') {
      setError('Please upload a valid CSV file');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const content = await file.text();
      const sampleParsed = parseCSV(content, false); // Sample for preview
      const fullParsed = parseCSV(content, true); // Full data for processing
      
      setOrderFile(file);
      setOrdersData(sampleParsed); // For preview and field mapping
      setFullOrdersData(fullParsed); // For actual processing
      // Auto-detect common field mappings
      autoDetectFieldMappings(sampleParsed.headers, 'orders');
    } catch (err) {
      setError(`Error processing orders file: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }, []);

  const handleServiceFileUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file || file.type !== 'text/csv') {
      setError('Please upload a valid CSV file');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const content = await file.text();
      const sampleParsed = parseCSV(content, false); // Sample for preview
      const fullParsed = parseCSV(content, true); // Full data for processing
      
      setServiceFile(file);
      setCommissionsData(sampleParsed); // For preview and field mapping
      setFullCommissionsData(fullParsed); // For actual processing
      // Auto-detect common field mappings
      autoDetectFieldMappings(sampleParsed.headers, 'commissions');
      
      // Set legacy headers for compatibility
      setFileHeaders(sampleParsed.headers || []);

      // Auto-detect common column names for legacy support
      const headers = sampleParsed.headers || [];
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

    } catch (err) {
      setError(`Error processing commissions file: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }, []);

  // Step 1: Process order file to extract companies (using full dataset)
  const processStep1 = async () => {
    if (!orderFile || !fullOrdersData.data.length) {
      setError('Please upload an Orders CSV file');
      return;
    }
    
    setProcessing(true);
    setError('');
    
    try {
      // Use the full dataset that was already parsed during upload
      const extracted = extractCompanyData(fullOrdersData);
      
      setExtractedData(extracted);
      setCurrentStep(2);
    } catch (err) {
      setError(`Error processing file: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  // Step 2: Enrich with service data (using full dataset)
  const processStep2 = async () => {
    if (!serviceFile || !fullCommissionsData.data.length) {
      setError('Please upload a Services CSV file');
      return;
    }

    if (!fieldMapping.commissions.customerField || !fieldMapping.commissions.serviceField) {
      setError('Please configure customer and service field mappings');
      return;
    }
    
    setProcessing(true);
    setError('');
    
    try {
      // Use the full dataset that was already parsed during upload
      const enriched = enrichWithServices(extractedData.locations, fullCommissionsData);
      
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
    setOrdersData({ headers: [], data: [] });
    setCommissionsData({ headers: [], data: [] });
    setFullOrdersData({ headers: [], data: [] });
    setFullCommissionsData({ headers: [], data: [] });
    setExtractedData({ customers: [], locations: [] });
    setEnrichedData({ matches: [], unmatched: [] });
    setError('');
    setSearchTerm('');
    setSelectedFilter('all');
    setExportFields({
      orders: new Set(),
      commissions: new Set()
    });
    setShowExportConfig(false);
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
    // Reset dynamic mappings to default
    setDynamicMappings([
      { id: 'customer', label: 'CUSTOMER', ordersField: 'customerField', commissionsField: 'customerField', required: true, icon: 'users' },
      { id: 'address', label: 'ADDRESS', ordersField: 'locationField', commissionsField: 'addressField', required: false, icon: 'map-pin' },
      { id: 'service', label: 'SERVICE', ordersField: 'productField', commissionsField: 'serviceField', required: true, icon: 'package' },
      { id: 'provider', label: 'PROVIDER', ordersField: 'providerField', commissionsField: 'providerField', required: false, icon: 'globe' },
      { id: 'account', label: 'ACCOUNT', ordersField: 'accountField', commissionsField: 'accountField', required: false, icon: 'hash' }
    ]);
    setNextMappingId(6);
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
        <h1 className="text-4xl font-bold text-gray-800 mb-2">Enhanced Data Migration Workflow</h1>
        <p className="text-gray-600">
          Two-step process with smart field mapping: Extract company data from orders, then enrich with service information
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

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
            <span className="text-red-700">{error}</span>
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

          {ordersData.headers.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-blue-900 mb-2">Detected Fields ({ordersData.headers.length})</h4>
              <div className="max-h-32 overflow-y-auto">
                <div className="grid grid-cols-3 gap-2 text-sm text-blue-700">
                  {ordersData.headers.map((header, index) => (
                    <div key={index} className="truncate">{header}</div>
                  ))}
                </div>
              </div>
              <p className="text-sm text-blue-600 mt-2">
                Preview: {ordersData.data.length} rows shown | Total: {fullOrdersData.data.length} rows loaded for processing
              </p>
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

      {/* Step 2: Enhanced Field Configuration */}
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

          {/* Services File Upload */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Upload Services/Commission File</h2>
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

            {commissionsData.headers.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <h4 className="font-medium text-green-900 mb-2">Detected Fields ({commissionsData.headers.length})</h4>
                <div className="max-h-32 overflow-y-auto">
                  <div className="grid grid-cols-3 gap-2 text-sm text-green-700">
                    {commissionsData.headers.map((header, index) => (
                      <div key={index} className="truncate">{header}</div>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-green-600 mt-2">
                  Preview: {commissionsData.data.length} rows shown | Total: {fullCommissionsData.data.length} rows loaded for processing
                </p>
              </div>
            )}
          </div>

          {/* Enhanced Field Mapping Interface */}
          {serviceFile && commissionsData.headers.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-800">Configure Field Mapping</h2>
                  <p className="text-gray-600 mt-1">Connect related fields between your Orders and Services files. You can add custom field mappings or remove optional ones.</p>
                </div>
                <button
                  onClick={() => setShowExportConfig(!showExportConfig)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                    showExportConfig 
                      ? 'bg-purple-100 text-purple-800 border border-purple-200'
                      : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  {showExportConfig ? 'Hide Export Fields' : 'Select Export Fields'}
                </button>
              </div>

              {/* Mapping Instructions */}
              <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h3 className="font-medium text-yellow-900 mb-2">Field Mapping Instructions</h3>
                <div className="text-sm text-yellow-800 space-y-1">
                  <p>• <strong>Required fields</strong> (marked with *) must be mapped for the workflow to function</p>
                  <p>• <strong>Click field names</strong> to edit custom mapping labels</p>
                  <p>• <strong>Use dropdown numbers</strong> to select corresponding fields from each file</p>
                  <p>• <strong>Add Field button</strong> creates new custom mappings for additional data connections</p>
                  <p>• <strong>X button</strong> removes optional field mappings you don't need</p>
                </div>
              </div>

              {showExportConfig && (
                <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <h3 className="font-medium text-purple-900 mb-2">Export Field Selection</h3>
                  <p className="text-sm text-purple-700 mb-3">
                    Click on field number badges to select which fields to include in your final CSV export. 
                    Selected fields will have a colored border.
                  </p>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                      <span>Orders: {exportFields.orders.size} fields selected</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                      <span>Services: {exportFields.commissions.size} fields selected</span>
                    </div>
                    <button
                      onClick={() => setExportFields({ orders: new Set(), commissions: new Set() })}
                      className="text-purple-600 hover:text-purple-800 underline"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              )}
              
              {/* Field Mapping Interface */}
              <div className="grid grid-cols-5 gap-4 mb-6">
                {/* Orders Column */}
                <div className="col-span-2">
                  <h3 className="text-lg font-medium text-blue-900 mb-4 text-center bg-blue-50 py-2 rounded-lg border border-blue-200">
                    📋 Orders File Fields
                  </h3>
                  <div className="space-y-3">
                    {ordersData.headers.map((header, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg border text-sm cursor-pointer transition-colors ${
                          Object.values(fieldMapping.orders).includes(header)
                            ? 'bg-blue-100 border-blue-300 text-blue-800'
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        } ${
                          exportFields.orders.has(header)
                            ? 'ring-2 ring-blue-500 ring-offset-1'
                            : ''
                        }`}
                        title={`Sample: ${ordersData.data[0]?.[header] || 'No data'}`}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (showExportConfig) {
                                toggleExportField('orders', header);
                              }
                            }}
                            className={`flex-shrink-0 w-6 h-6 text-white text-xs font-bold rounded-full flex items-center justify-center transition-colors ${
                              showExportConfig
                                ? exportFields.orders.has(header)
                                  ? 'bg-blue-600 ring-2 ring-blue-300'
                                  : 'bg-gray-400 hover:bg-blue-500'
                                : 'bg-blue-600'
                            }`}
                            disabled={!showExportConfig}
                          >
                            {index + 1}
                          </button>
                          <div className="font-medium flex-1">{header}</div>
                          {showExportConfig && exportFields.orders.has(header) && (
                            <Check className="w-4 h-4 text-blue-600" />
                          )}
                        </div>
                        {ordersData.data[0]?.[header] && (
                          <div className="text-xs text-gray-600 mt-1 ml-8 truncate">
                            {ordersData.data[0][header]}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mapping Configuration */}
                <div className="col-span-1 flex flex-col justify-center">
                  <div className="space-y-4">
                    {/* Dynamic Field Mappings */}
                    {dynamicMappings.map((mapping, index) => (
                      <div key={mapping.id} className="text-center">
                        <div className="flex items-center justify-center mb-2">
                          <div className="flex items-center gap-1">
                            {getMappingIcon(mapping.icon)}
                            <input
                              type="text"
                              value={mapping.label}
                              onChange={(e) => updateMappingLabel(mapping.id, e.target.value)}
                              className="text-xs font-medium text-gray-700 bg-transparent border-none p-0 text-center w-20 focus:ring-1 focus:ring-blue-500 rounded"
                              disabled={mapping.required}
                            />
                            {mapping.required && (
                              <span className="text-red-500 text-xs">*</span>
                            )}
                            {!mapping.required && (
                              <button
                                onClick={() => removeFieldMapping(mapping.id)}
                                className="ml-1 w-4 h-4 text-red-500 hover:text-red-700 transition-colors"
                                title="Remove this field mapping"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-center">
                          <select
                            value={fieldMapping.orders[mapping.ordersField] || ''}
                            onChange={(e) => setFieldMapping(prev => ({
                              ...prev,
                              orders: { ...prev.orders, [mapping.ordersField]: e.target.value }
                            }))}
                            className="w-16 px-1 py-1 text-xs border border-gray-300 rounded mr-1"
                          >
                            <option value="">-</option>
                            {ordersData.headers.map((header, headerIndex) => (
                              <option key={header} value={header}>{headerIndex + 1}</option>
                            ))}
                          </select>
                          <ArrowRight className="w-4 h-4 text-gray-400 mx-1" />
                          <select
                            value={fieldMapping.commissions[mapping.commissionsField] || ''}
                            onChange={(e) => setFieldMapping(prev => ({
                              ...prev,
                              commissions: { ...prev.commissions, [mapping.commissionsField]: e.target.value }
                            }))}
                            className="w-16 px-1 py-1 text-xs border border-gray-300 rounded ml-1"
                          >
                            <option value="">-</option>
                            {commissionsData.headers.map((header, headerIndex) => (
                              <option key={header} value={header}>{headerIndex + 1}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}

                    {/* Add Field Mapping Button */}
                    <div className="text-center pt-2 border-t border-gray-200">
                      <button
                        onClick={addFieldMapping}
                        className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded hover:bg-blue-100 transition-colors mx-auto"
                        title="Add a new field mapping"
                      >
                        <Plus className="w-3 h-3" />
                        Add Field
                      </button>
                      <p className="text-xs text-gray-500 mt-1">
                        <span className="text-red-500">*</span> Required fields
                      </p>
                    </div>
                  </div>
                </div>

                {/* Services Column */}
                <div className="col-span-2">
                  <h3 className="text-lg font-medium text-green-900 mb-4 text-center bg-green-50 py-2 rounded-lg border border-green-200">
                    💰 Services File Fields
                  </h3>
                  <div className="space-y-3">
                    {commissionsData.headers.map((header, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg border text-sm cursor-pointer transition-colors ${
                          Object.values(fieldMapping.commissions).includes(header)
                            ? 'bg-green-100 border-green-300 text-green-800'
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        } ${
                          exportFields.commissions.has(header)
                            ? 'ring-2 ring-green-500 ring-offset-1'
                            : ''
                        }`}
                        title={`Sample: ${commissionsData.data[0]?.[header] || 'No data'}`}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (showExportConfig) {
                                toggleExportField('commissions', header);
                              }
                            }}
                            className={`flex-shrink-0 w-6 h-6 text-white text-xs font-bold rounded-full flex items-center justify-center transition-colors ${
                              showExportConfig
                                ? exportFields.commissions.has(header)
                                  ? 'bg-green-600 ring-2 ring-green-300'
                                  : 'bg-gray-400 hover:bg-green-500'
                                : 'bg-green-600'
                            }`}
                            disabled={!showExportConfig}
                          >
                            {index + 1}
                          </button>
                          <div className="font-medium flex-1">{header}</div>
                          {showExportConfig && exportFields.commissions.has(header) && (
                            <Check className="w-4 h-4 text-green-600" />
                          )}
                        </div>
                        {commissionsData.data[0]?.[header] && (
                          <div className="text-xs text-gray-600 mt-1 ml-8 truncate">
                            {commissionsData.data[0][header]}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Additional Service Fields */}
              <div className="border-t pt-6">
                <h4 className="font-medium text-gray-900 mb-4">Additional Service Fields (Optional)</h4>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount/Revenue Field</label>
                    <select
                      value={fieldMapping.commissions.amountField}
                      onChange={(e) => setFieldMapping(prev => ({
                        ...prev,
                        commissions: { ...prev.commissions, amountField: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select field...</option>
                      {commissionsData.headers.map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Account Number Field</label>
                    <select
                      value={fieldMapping.commissions.accountField}
                      onChange={(e) => setFieldMapping(prev => ({
                        ...prev,
                        commissions: { ...prev.commissions, accountField: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select field...</option>
                      {commissionsData.headers.map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Provider Customer Name</label>
                    <select
                      value={fieldMapping.commissions.providerCustomerField}
                      onChange={(e) => setFieldMapping(prev => ({
                        ...prev,
                        commissions: { ...prev.commissions, providerCustomerField: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select field...</option>
                      {commissionsData.headers.map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Sample Data Preview */}
              {fieldMapping.orders.customerField && fieldMapping.commissions.customerField && (
                <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-3">Sample Data Preview</h4>
                  <div className="grid lg:grid-cols-2 gap-4 text-sm">
                    <div>
                      <h5 className="font-medium text-blue-800 mb-2">Orders Sample:</h5>
                      {ordersData.data.slice(0, 2).map((row, index) => (
                        <div key={index} className="bg-white p-2 rounded border mb-2">
                          {dynamicMappings.map(mapping => {
                            const fieldValue = fieldMapping.orders[mapping.ordersField];
                            if (fieldValue && row[fieldValue]) {
                              return (
                                <div key={mapping.id}>
                                  <strong>{mapping.label}:</strong> {row[fieldValue]}
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      ))}
                    </div>
                    <div>
                      <h5 className="font-medium text-blue-800 mb-2">Services Sample:</h5>
                      {commissionsData.data.slice(0, 2).map((row, index) => (
                        <div key={index} className="bg-white p-2 rounded border mb-2">
                          {dynamicMappings.map(mapping => {
                            const fieldValue = fieldMapping.commissions[mapping.commissionsField];
                            if (fieldValue && row[fieldValue]) {
                              return (
                                <div key={mapping.id}>
                                  <strong>{mapping.label}:</strong> {row[fieldValue]}
                                </div>
                              );
                            }
                            return null;
                          })}
                          {/* Show additional fields */}
                          {fieldMapping.commissions.amountField && row[fieldMapping.commissions.amountField] && (
                            <div><strong>AMOUNT:</strong> {row[fieldMapping.commissions.amountField]}</div>
                          )}
                          {fieldMapping.commissions.providerCustomerField && row[fieldMapping.commissions.providerCustomerField] && (
                            <div><strong>PROVIDER CUSTOMER:</strong> {row[fieldMapping.commissions.providerCustomerField]}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
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
                  Data Source: Enhanced Workflow Processing
                </div>
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