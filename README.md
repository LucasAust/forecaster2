# forecaster2
Project Name: Arc (AI Financial Forecaster)
1. Project Overview
Arc is an intelligent personal finance application that moves beyond simple tracking to provide predictive financial modeling. By integrating Plaid for real-time historical data and Google Gemini for generative AI modeling, the system predicts future cash flow, generates mock transactions for upcoming periods (14, 30, 60, or 90 days), and creates a sandbox environment for scenario planning.
Core Value Proposition
Most budget apps tell you where your money went. Arc tells you where your money is going to go, allowing you to ask "What if?" questions to an AI financial assistant.
2. System Architecture & Data Flow
The Workflow
Data Ingestion: The app connects to the user's bank accounts via Plaid API to fetch the last 12 months of transaction history.
Data Cleaning: Transactions are sanitized (categorized and normalized) to remove noise.
Generative Prediction (Gemini):
The cleaned history is sent to Google Gemini via API.
The Prompt: Gemini is instructed to analyze spending habits, recurring bills, and irregular spending patterns to generate a calendar of predicted future transactions for a user-selected window (14/30/60/90 days).
The Output: Gemini returns a structured JSON dataset of mock future transactions (e.g., "2023-12-16": {"Merchant": "Subway", "Amount": -16.00, "Category": "Food"}).
Visualization Layer: The frontend parses this JSON to render cashflow calendars, projected balance line charts, and expense pie charts.
Scenario Assistant (RAG Chatbot): A secondary LLM instance acts as a financial advisor. It has access to the predicted dataset and can answer queries like "How can I save for a vacation?" or "What happens to my balance if my car breaks down and costs $500?"
Architecture Diagram (Mermaid)
code
Mermaid
graph TD
    User[User] -->|Connects Bank| Frontend
    Frontend -->|Plaid Link| PlaidAPI
    PlaidAPI -->|Transaction History| Backend
    Backend -->|Cleaned Data + Timeframe| Gemini_Model
    Gemini_Model -->|Predicted JSON Schema| Backend
    Backend -->|Parsed Data| Database
    Database -->|Visualizations| Frontend
    User -->|Scenario Questions| Chatbot_LLM
    Chatbot_LLM -->|Reads Predicted Data| Frontend
3. Data Schema (Gemini Output)
To ensure the visualizations works correctly, the Gemini model is instructed to return data in the following strict JSON format:
code
JSON
{
  "forecast_period_days": 30,
  "predicted_transactions": [
    {
      "date": "2024-12-16",
      "day_of_week": "Thursday",
      "merchant": "Subway",
      "amount": -16.00,
      "category": "Dining",
      "type": "expense",
      "confidence_score": "high"
    },
    {
      "date": "2024-12-15",
      "day_of_week": "Friday",
      "merchant": "Paycheck",
      "amount": 2500.00,
      "category": "Income",
      "type": "income",
      "confidence_score": "certain"
    }
  ]
}
4. Feature Specification & UI Design
Based on the provided wireframes, the application is divided into five core views.
A. Dashboard / Home (The "Hello" View)
Based on Wireframe Image 3
Header: User Greeting ("Hello, [Name]") & Navigation Bar.
Quick Input: A text input field asking: "Hi, what can I help you model today?" which shortcuts to the Scenario Planner.
Key Metrics:
Current Balance: Large, bold display of real-time funds.
Projected 30 Day Balance Graph: A simplified sparkline graph showing the trend direction.
2 Week Quick Glance: A horizontal calendar strip showing the immediate upcoming predicted bills and income.
B. Forecast Hub
Based on Wireframe Image 4
Projected Balance Graph: A complex multi-line chart tracking:
Line A: Total Balance
Line B: Cumulative Expenses
Line C: Cumulative Income
Reduction Options: An AI-generated list of suggestions to reduce costs based on the specific forecast (e.g., "Cancel unused subscription detected on Dec 18th").
30-Day Calendar: A scrollable list view toggleable between 30, 60, and 90 days.
Columns: Date | Income | Expenses | Daily Ending Balance.
C. Budget Tracker
Based on Wireframe Image 2
Monthly Budget Target: A manual entry field or AI-suggested cap for the month.
Category Spend Tracker:
Pie Chart: Visual breakdown of predicted expenses (Housing, Food, Transport).
Histogram: "Month over Month Variance" showing how this month's prediction compares to last month's actuals.
D. Scenario Planner (The Chatbot)
Based on Wireframe Image 1
Interface: A split-screen view.
Left/Bottom: Chat interface ("Chat Bot") for natural language interaction.
Right/Top: "Model Output" area where the AI updates the graphs based on the conversation.
Quick Scenarios: One-click buttons for common stress tests:
"Car Repairs" (Injects a random 
500
−
500−
1000 expense).
"Holidays" (Injects travel/gift costs).
"Job Loss" (Removes income streams).
Functionality: If the user asks, "Can I afford a PS5 on Friday?", the bot checks the predicted ending balance for that Friday and responds accordingly.
E. Transactions Ledger (The Missing Tab)
Design Specification
Since this was not pictured, the design follows the established aesthetic:
Header: Standard Logo & Navigation.
Controls:
Search Bar: Filter by merchant name.
Sort Options: Date (Oldest/Newest), Amount (High/Low).
Toggle: "Show Actuals" vs "Show Predicted".
The List: A clean table layout.
Row Style: Actual transactions in Black text; Predicted transactions in Blue/Italic text to differentiate.
Columns: Date | Merchant | Category | Amount | Running Balance.
5. Technology Stack
Frontend: React.js or Next.js (for chart rendering and state management).
Visualization Library: Recharts or Chart.js (for the line graphs and pie charts).
Backend: Node.js (Express) or Python (FastAPI).
Banking Integration: Plaid API.
AI Models:
Forecasting: Google Gemini 1.5 Pro (via Vertex AI or Studio API).
Chatbot: Google Gemini 1.5 Flash (optimized for speed/chat).
Database: PostgreSQL (for user data) + Redis (for caching Plaid tokens).
6. Prompt Engineering Strategy
To get the specific calendar output required for the system, the prompt sent to Gemini will look like this:
"You are a financial prediction engine. I will provide you with a CSV of the user's last 90 days of transaction history.
Task: Generate a mock transaction ledger for the NEXT [30] days.
Logic:
Identify recurring bills (subscriptions, rent, utilities) and place them on their likely future dates.
Analyze discretionary spending (groceries, subway, coffee) and randomly scatter similar transactions throughout the period to match the user's spending density and average amounts.
Account for payday patterns (e.g., every other Friday).
Output: Return ONLY a JSON object containing an array of these predicted transactions. Do not include markdown or conversational text."
7. Installation & Setup
Clone the Repo:
code
Bash
git clone https://github.com/yourusername/Arc.git
Install Dependencies:
code
Bash
npm install
Environment Variables:
Create a .env file and add:
code
Code
PLAID_CLIENT_ID=your_id
PLAID_SECRET=your_secret
GEMINI_API_KEY=your_google_key
Run Development Server:
code
Bash
npm run dev