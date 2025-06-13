import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const body = await request.json();
        const { prompt, apiKey } = body;

        if (!apiKey) {
            return NextResponse.json({ error: 'API key required' }, { status: 400 });
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 1024,
                temperature: 0.1,
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return NextResponse.json(
                {
                    error: `Claude API error: ${response.status} - ${errorData.error?.message || 'Unknown error'
                        }`,
                },
                { status: response.status }
            );
        }

        const data = await response.json();

        if (
            !data.content ||
            !Array.isArray(data.content) ||
            !data.content[0]?.text
        ) {
            return NextResponse.json(
                { error: 'Invalid response from Claude API' },
                { status: 500 }
            );
        }

        return NextResponse.json({ text: data.content[0].text });
    } catch (error) {
        console.error('Proxy error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}