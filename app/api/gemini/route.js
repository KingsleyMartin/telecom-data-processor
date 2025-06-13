import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const body = await request.json();
        const { prompt, apiKey } = body;

        if (!apiKey) {
            return NextResponse.json({ error: 'API key required' }, { status: 400 });
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: prompt }],
                    },
                ],
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return NextResponse.json(
                {
                    error: `Gemini API error: ${response.status} - ${errorData.error?.message || 'Unknown error'
                        }`,
                },
                { status: response.status }
            );
        }

        const data = await response.json();

        if (
            !data.candidates ||
            !Array.isArray(data.candidates) ||
            !data.candidates[0]?.content?.parts[0]?.text
        ) {
            return NextResponse.json(
                { error: 'Invalid response from Gemini API' },
                { status: 500 }
            );
        }

        return NextResponse.json({ text: data.candidates[0].content.parts[0].text });

    } catch (error) {
        console.error('Proxy error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}