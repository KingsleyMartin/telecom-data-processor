// app/api/standardize-address/route.js
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
    const { companyName, address } = await request.json();

    // Validate input
    if (!companyName || !address) {
      return Response.json(
        { error: 'Company name and address are required' },
        { status: 400 }
      );
    }

    // Construct the prompt
    const prompt = `Rules:
    1. Detect if a field contains multiple address elements
    -- If the field contains the entire address including street: Break the single-line address into separate fields: "Address 1", "Address 2", "City", "State", and "Zip Code".
    -- If the field contains city, state, and zip code: Break it into "City", "State", and "Zip Code".
    2. Identify and place any suite, unit, apartment, building, or floor information into the "Address 2" field. Remove information in Address 2 if it is the same as Address 1.
    3. Convert all fields to proper title case (first letter of each word capitalized), except for the State which should be a 2-letter uppercase code.
    4. Standardize street suffixes (St -> Street, Ave -> Avenue, Rd -> Road, Dr -> Drive, Blvd -> Boulevard, Ln -> Lane, Ct -> Court).
    5. Clean and format city names properly.
    6. Keep the zip code as-is but remove any invalid characters (except for dashes).
    Return format (valid JSON only): {
      "Address 1": "cleaned primary address",
      "Address 2": "suite/unit info if any",
      "City": "cleaned city",
      "State": "XX",
      "Zip Code": "zipcode" }

    Company: ${companyName}
    Address to standardize: ${address}`;

    // Generate content using Gemini
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse the JSON response from Gemini
    let standardizedAddress;
    try {
      // Clean the response text to extract JSON (remove markdown code block)
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        standardizedAddress = JSON.parse(jsonMatch[1]);
      } else {
        // Fallback for responses without markdown, try direct parse
        standardizedAddress = JSON.parse(text);
      }
    } catch (parseError) {
      console.error('Error parsing Gemini response:', parseError);
      console.error('Raw response:', text);

      // Fallback response structure
      standardizedAddress = {
        "Address 1": address,
        "Address 2": "",
        "City": "",
        "State": "",
        "Zip Code": ""
      };
    }

    // Ensure all required fields exist
    const finalResponse = {
      "Address 1": standardizedAddress["Address 1"] || "",
      "Address 2": standardizedAddress["Address 2"] || "",
      "City": standardizedAddress["City"] || "",
      "State": standardizedAddress["State"] || "",
      "Zip Code": standardizedAddress["Zip Code"] || ""
    };

    return Response.json({
      success: true,
      data: finalResponse,
      originalInput: { companyName, address }
    });

  } catch (error) {
    console.error('Error in address standardization:', error);

    return Response.json(
      {
        error: 'Failed to standardize address',
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