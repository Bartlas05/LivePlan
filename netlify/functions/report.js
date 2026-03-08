import fetch from "node-fetch";

export async function handler(event, context) {
    try {
        const { title, body } = JSON.parse(event.body);

        const response = await fetch("https://api.github.com/repos/AzOr45/LivePlan/issues", {
            method: "POST",
            headers: {
                "Authorization": `token ${process.env.GITHUB_TOKEN}`,
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ title, body })
        });

        const data = await response.json();
        console.log("GitHub response:", data); // zobacz w logach Netlify

        if (data.html_url) {
            return {
                statusCode: 200,
                body: JSON.stringify({ success: true, html_url: data.html_url })
            };
        } else {
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, error: JSON.stringify(data) })
            };
        }
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ success: false, error: err.toString() }) };
    }
}