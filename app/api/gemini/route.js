// app/api/gemini/route.js
import { NextRequest, NextResponse } from 'next/server';

// Rate limiting store (in production, use Redis or a proper rate limiting service)
const rateLimitStore = new Map();

// Rate limiting helper
const checkRateLimit = (ip, limit = 100, windowMs = 60000) => {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, []);
  }
  
  const requests = rateLimitStore.get(ip);
  const recentRequests = requests.filter(time => time > windowStart);
  
  if (recentRequests.length >= limit) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimitStore.set(ip, recentRequests);
  return true;
};

// Gemini API service class for backend
class GeminiAPIService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }
    // Fixed: Use Gemini Flash 1.5 endpoint
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
    this.rateLimitDelay = 1000;
    this.maxRetries = 3;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async withRetry(operation, retries = this.maxRetries) {
    try {
      return await operation();
    } catch (error) {
      if (retries > 0 && (error.status === 429 || error.status >= 500)) {
        const delay = Math.pow(2, this.maxRetries - retries) * 1000;
        await this.delay(delay);
        return this.withRetry(operation, retries - 1);
      }
      throw error;
    }
  }

  async callGemini(prompt, systemInstruction) {
    // Fixed: Use API key as query parameter for Gemini API
    const url = `${this.baseUrl}?key=${this.apiKey}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Fixed: Use correct Gemini API request format
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${systemInstruction}\n\n${prompt}`
            }]
          }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 1024,
            topK: 40,
            topP: 0.95
          }
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`API error: ${response.status} – ${JSON.stringify(error, null, 2)}`);
      }

      const data = await response.json();
      // Fixed: Use correct response path for Gemini API
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    } catch (error) {
      console.error('API call failed:', error);
      throw error;
    }
  }

  async standardizeName(customerName) {
    const systemInstruction = `You are a data standardization expert. Clean and standardize business names while preserving their core identity.

Rules:
1. Convert to proper case (avoid ALL CAPS unless it's an acronym)
2. Standardize business suffixes: Inc, LLC, Corp, Co, Ltd, etc.
3. Remove unnecessary punctuation while preserving essential formatting
4. Fix common abbreviations
5. Maintain the core business identity

Always respond with valid JSON only.`;

    const prompt = `Standardize this business name: "${customerName}"

Return JSON format:
{
  "standardizedName": "cleaned business name",
  "confidence": 0.95,
  "changes": ["list of changes made"],
  "businessType": "corporation|llc|partnership|sole_proprietorship|other"
}`;

    return this.withRetry(async () => {
      await this.delay(this.rateLimitDelay);
      const response = await this.callGemini(prompt, systemInstruction);
      
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in response');
        return JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('JSON parsing error:', parseError);
        return {
          standardizedName: this.basicNameStandardization(customerName),
          confidence: 0.7,
          changes: ['Basic standardization applied due to API parsing error'],
          businessType: 'other'
        };
      }
    });
  }

  async standardizeAddress(address) {
    const systemInstruction = `You are an address standardization expert. Parse and clean addresses into structured components.

Rules:
1. Separate suite/apartment/floor/building information into Address2
2. Standardize street suffixes (St → Street, Ave → Avenue)
3. Use official state abbreviations (2 letters)
4. Format ZIP codes consistently
5. Remove country if USA
6. Fix obvious formatting issues

Always respond with valid JSON only.`;

    const prompt = `Parse and standardize this address: "${address}"

Return JSON format:
{
  "address1": "street number and name",
  "address2": "suite/apt/floor info or null",
  "city": "city name",
  "state": "two-letter state code",
  "zipCode": "formatted zip code",
  "confidence": 0.0-1.0,
  "issues": ["list any problems found"]
}`;

    return this.withRetry(async () => {
      await this.delay(this.rateLimitDelay);
      const response = await this.callGemini(prompt, systemInstruction);
      
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in response');
        return JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('JSON parsing error:', parseError);
        return this.basicAddressParsing(address);
      }
    });
  }

  async compareNames(name1, name2) {
    const systemInstruction = `You are a duplicate detection expert. Determine if two business names represent the same company.

Consider:
1. Abbreviations vs full words
2. Common business name variations
3. Typos and spelling differences
4. Different legal structures of same business

Always respond with valid JSON only.`;

    const prompt = `Compare these business names:

Name 1: "${name1}"
Name 2: "${name2}"

Return JSON:
{
  "isDuplicate": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "explanation of decision",
  "suggestedCanonicalName": "preferred name if duplicate"
}`;

    return this.withRetry(async () => {
      await this.delay(this.rateLimitDelay);
      const response = await this.callGemini(prompt, systemInstruction);
      
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in response');
        return JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('JSON parsing error:', parseError);
        const similarity = this.calculateStringSimilarity(name1.toLowerCase(), name2.toLowerCase());
        return {
          isDuplicate: similarity > 0.8,
          confidence: similarity,
          reasoning: 'Basic string similarity comparison used due to API parsing error',
          suggestedCanonicalName: name1.length > name2.length ? name1 : name2
        };
      }
    });
  }

  // Batch processing for efficiency
  async processBatch(records, operation) {
    const results = [];
    const batchSize = 5;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const batchPromises = batch.map(async (record, index) => {
        try {
          // Add small delay between requests in batch
          await this.delay(index * 200);
          
          if (operation === 'standardizeName') {
            return await this.standardizeName(record.name);
          } else if (operation === 'standardizeAddress') {
            return await this.standardizeAddress(record.address);
          }
        } catch (error) {
          console.error(`Error processing record in batch:`, error);
          return {
            error: error.message,
            confidence: 0.5
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  basicNameStandardization(name) {
    return name.trim().toLowerCase().split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
      .replace(/\binc\b/gi, 'Inc.').replace(/\bllc\b/gi, 'LLC')
      .replace(/\bcorp\b/gi, 'Corp.').replace(/\bco\b$/gi, 'Co.');
  }

  basicAddressParsing(address) {
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

  calculateStringSimilarity(str1, str2) {
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

export async function POST(request) {
  try {
    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';

    // Check rate limit
    if (!checkRateLimit(clientIP)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // Get API key from environment variables
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key not configured on server' },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { operation, data } = body;

    if (!operation) {
      return NextResponse.json(
        { error: 'Operation not specified' },
        { status: 400 }
      );
    }

    const geminiService = new GeminiAPIService();

    switch (operation) {
      case 'standardizeName':
        if (!data.name) {
          return NextResponse.json(
            { error: 'Name is required for standardization' },
            { status: 400 }
          );
        }
        const nameResult = await geminiService.standardizeName(data.name);
        return NextResponse.json({ success: true, result: nameResult });

      case 'standardizeAddress':
        if (!data.address) {
          return NextResponse.json(
            { error: 'Address is required for standardization' },
            { status: 400 }
          );
        }
        const addressResult = await geminiService.standardizeAddress(data.address);
        return NextResponse.json({ success: true, result: addressResult });

      case 'compareNames':
        if (!data.name1 || !data.name2) {
          return NextResponse.json(
            { error: 'Both names are required for comparison' },
            { status: 400 }
          );
        }
        const comparisonResult = await geminiService.compareNames(data.name1, data.name2);
        return NextResponse.json({ success: true, result: comparisonResult });

      case 'processBatch':
        if (!data.records || !Array.isArray(data.records)) {
          return NextResponse.json(
            { error: 'Records array is required for batch processing' },
            { status: 400 }
          );
        }
        if (!data.batchOperation) {
          return NextResponse.json(
            { error: 'Batch operation type is required' },
            { status: 400 }
          );
        }
        
        // Limit batch size for safety
        if (data.records.length > 50) {
          return NextResponse.json(
            { error: 'Batch size too large. Maximum 50 records per batch.' },
            { status: 400 }
          );
        }

        const batchResults = await geminiService.processBatch(data.records, data.batchOperation);
        return NextResponse.json({ success: true, results: batchResults });

      case 'findDuplicates':
        if (!data.records || !Array.isArray(data.records)) {
          return NextResponse.json(
            { error: 'Records array is required for duplicate detection' },
            { status: 400 }
          );
        }

        // Limit duplicate detection for performance
        if (data.records.length > 100) {
          return NextResponse.json(
            { error: 'Too many records for duplicate detection. Maximum 100 records.' },
            { status: 400 }
          );
        }

        const duplicateGroups = [];
        const processed = new Set();
        
        for (let i = 0; i < data.records.length; i++) {
          if (processed.has(i)) continue;

          const currentRecord = data.records[i];
          const duplicates = [];

          for (let j = i + 1; j < data.records.length; j++) {
            if (processed.has(j)) continue;

            const compareRecord = data.records[j];
            const comparison = await geminiService.compareNames(
              currentRecord.standardizedName || currentRecord.name,
              compareRecord.standardizedName || compareRecord.name
            );

            if (comparison.isDuplicate && comparison.confidence > 0.7) {
              duplicates.push({
                ...compareRecord,
                comparisonConfidence: comparison.confidence,
                reasoning: comparison.reasoning
              });
              processed.add(j);
            }
          }

          if (duplicates.length > 0) {
            duplicateGroups.push({
              canonicalRecord: currentRecord,
              duplicates: duplicates,
              confidence: duplicates.reduce((acc, dup) => acc + dup.comparisonConfidence, 0) / duplicates.length,
              reasoning: 'AI-detected business name similarity'
            });
            processed.add(i);
          }
        }

        return NextResponse.json({ 
          success: true, 
          result: { duplicateGroups } 
        });

      default:
        return NextResponse.json(
          { error: 'Unknown operation' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Gemini API route error:', error);
    
    // Don't expose sensitive error details in production
    const isDev = process.env.NODE_ENV === 'development';
    
    return NextResponse.json(
      { 
        error: isDev ? error.message : 'Internal server error',
        details: isDev ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  
  return NextResponse.json({
    status: 'healthy',
    apiConfigured: !!apiKey,
    timestamp: new Date().toISOString()
  });
}