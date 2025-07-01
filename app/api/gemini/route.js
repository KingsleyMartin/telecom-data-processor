import { GoogleGenerativeAI } from '@google/generative-ai';

// Verify API key is present
if (!process.env.GEMINI_API_KEY) {
  throw new Error('Missing GEMINI_API_KEY environment variable');
}

// Initialize the model
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

export async function POST(request) {
  try {
    // Parse the request body
    const { companyName, address, locationName = '', locationType = '', country = '', status = '' } = await request.json();

    // Validate input
    if (!companyName || !address) {
      return Response.json(
        { error: 'Company name and address are required' },
        { status: 400 }
      );
    }

    // Construct the enhanced prompt
    const prompt = `Address and Company Information Standardization Rules:

    1. Address Standardization:
    -- If the field contains the entire address including street: Break the single-line address into separate fields: "Address 1", "Address 2", "City", "State", and "Zip Code".
    -- If the field contains city, state, and zip code: Break it into "City", "State", and "Zip Code".
    -- Identify and place any suite, unit, apartment, building, room, or floor information into the "Address 2" field. Remove information in Address 2 if it is the same as Address 1.
    -- Convert all fields to proper title case (first letter of each word capitalized), except for the State which should be a 2-letter uppercase code.
    -- Standardize street suffixes (St -> Street, Ave -> Avenue, Rd -> Road, Dr -> Drive, Blvd -> Boulevard, Ln -> Lane, Ct -> Court, Ste -> Suite).
    -- Clean and format city names properly.
    -- Keep the zip code as-is but remove any invalid characters (except for dashes).
    -- Ensure the country is set to "US" for US addresses, or use the appropriate country code for international addresses.

    2. Company Name Standardization:
    -- Convert company names from ALL CAPS to proper Initial Case formatting, while preserving names that are legitimately written in all capitals.
    -- Preserve ALL CAPS for these categories:
       • Acronyms/Initialisms: IBM, NASA, AT&T, UPS, CVS, AMD, HP, GM, API, AWS, SAP
       • Stock tickers used as names: JPM, BAC, WMT
       • Technology: IBM, HP, AMD, SAP, AWS
       • Financial: JPM, BAC, AIG, AXA
       • Telecommunications: AT&T, T-Mobile, BT
       • Retail: CVS, JCP, H&M
       • Transportation: UPS, FedEx, AAL
       • Media: CNN, BBC, NBC (when part of company names)
    -- Mixed formatting: Apply Initial Case to individual words while preserving legitimate caps:
       • IBM CORPORATION → IBM Corporation
       • AT&T WIRELESS → AT&T Wireless
       • JP MORGAN CHASE → JP Morgan Chase
    -- Examples:
       • APPLE INC → Apple Inc
       • MICROSOFT CORPORATION → Microsoft Corporation
       • INTERNATIONAL BUSINESS MACHINES → IBM
       • AMAZON WEB SERVICES → Amazon Web Services
       • JPMORGAN CHASE & CO → JPMorgan Chase & Co

    3. Location Name Standardization:
    -- Apply proper title case formatting
    -- Remove unnecessary words like "Location", "Site", "Branch" unless they are part of the actual name
    -- Standardize common abbreviations (HQ -> Headquarters, Corp -> Corporate)

    4. Location Type Standardization:
    -- Standardize to common categories: Headquarters, Branch Office, Warehouse, Distribution Center, Manufacturing Plant, Retail Store, Service Center, Regional Office, etc.
    -- Use proper title case formatting
    -- Be consistent with terminology

    5. Status Standardization:
    -- Standardize to common statuses: Active, Inactive, Pending, Closed, Under Construction, etc.
    -- Use proper title case formatting
    -- Be consistent with terminology

    6. Country Standardization:
    -- Use standard 2-letter country codes (US, CA, UK, etc.) or full country names in proper case
    -- Default to "US" if not specified and address appears to be US-based

    Return format (valid JSON only): {
      "Company Name": "standardized company name",
      "Location Name": "standardized location name",
      "Location Type": "standardized location type",
      "Address 1": "cleaned primary address",
      "Address 2": "suite/unit info if any",
      "City": "cleaned city",
      "State": "XX",
      "Zip Code": "zipcode",
      "Country": "country code or name",
      "Status": "standardized status"
    }

    Company: ${companyName}
    Address to standardize: ${address}
    Location Name: ${locationName}
    Location Type: ${locationType}
    Country: ${country}
    Status: ${status}`;

    // Generate content using Gemini
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse the JSON response from Gemini
    let standardizedData;
    try {
      // Clean the response text to extract JSON (remove markdown code block)
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        standardizedData = JSON.parse(jsonMatch[1]);
      } else {
        // Fallback for responses without markdown, try direct parse
        standardizedData = JSON.parse(text);
      }
    } catch (parseError) {
      console.error('Error parsing Gemini response:', parseError);
      console.error('Raw response:', text);

      // Fallback response structure
      standardizedData = {
        "Company Name": companyName,
        "Location Name": locationName,
        "Location Type": locationType,
        "Address 1": address,
        "Address 2": "",
        "City": "",
        "State": "",
        "Zip Code": "",
        "Country": country || "US",
        "Status": status
      };
    }

    // Ensure all required fields exist
    const finalResponse = {
      "Company Name": standardizedData["Company Name"] || companyName,
      "Location Name": standardizedData["Location Name"] || locationName,
      "Location Type": standardizedData["Location Type"] || locationType,
      "Address 1": standardizedData["Address 1"] || "",
      "Address 2": standardizedData["Address 2"] || "",
      "City": standardizedData["City"] || "",
      "State": standardizedData["State"] || "",
      "Zip Code": standardizedData["Zip Code"] || "",
      "Country": standardizedData["Country"] || country || "US",
      "Status": standardizedData["Status"] || status
    };

    return Response.json({
      success: true,
      data: finalResponse,
      originalInput: { companyName, address, locationName, locationType, country, status }
    });

  } catch (error) {
    console.error('Error in address and company information standardization:', error);

    return Response.json(
      {
        error: 'Failed to standardize address and company information',
        details: error.message
      },
      { status: 500 }
    );
  }
}

// Handle preflight requests for CORS
export async function OPTIONS(request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}