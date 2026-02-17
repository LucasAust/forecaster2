Design 

D-1 | Mobile Responsive Layout 

The application has no mobile or tablet responsive layout. The sidebar remains fixed and content does not reflow at smaller breakpoints. Implement a collapsible hamburger menu for mobile, stack dashboard cards vertically on narrow screens, and ensure all charts resize properly. This is critical for a consumer financial app where the majority of users will access from mobile devices. 

 

D-2 | Dashboard Chart Interactivity 

The Projected Balance chart on the dashboard has no tooltips, hover states, or click interactions. Users cannot see exact values for specific dates. Add hover tooltips showing date and exact balance and consider clicking-to-drill-down into daily transactions. 

 

D-3 | Upcoming Forecast Card Transaction 

Transaction names in the horizontal scrolling forecast cards are truncated with no way to view the full name. Add tooltips on hover to reveal the complete merchant's name and consider offering a compact list of view alternatives. 

 

D-4 | Budget Tracker Category Breakdown Chart 

The pie chart in the Category Breakdown section is nearly invisible because most spending is uncategorized. Once auto-categorization is implemented (see C-2), verify that this chart renders properly with multiple-colored segments, clear labels, and percentage values. 

 

D-5 | Scenario Planner Empty State 

When no scenario has been run, the Projected Impact panel displays a flat chart and metrics that mirror the current forecast. This is confusing. Replace with a clear empty state message such as “Run a scenario to see its projected impact” until the user submits a query. 

 

D-6 | Greeting Displays Raw Username 

The dashboard greeting shows “Hello, Blacombe20” which is a system username, not a display name. Pull the user’s actual name from their profile or add a display name field in Settings. First impressions matter for user retention. 

 

D-7 | Merchant Name Cleanup 

Transaction merchant names display raw bank feed data (e.g., ”ACH Withdrawal APPLECARD GSBANK PAYMENT,” “ATT* BILL PAYME”). Implement merchant name normalization to show clean names (e.g., “Apple Card,” “AT&T”) with merchant logos where available. 

 

D-8 | Loading and Empty States 

No skeleton loaders, spinners, or empty-state components detected anywhere in the app. Add skeleton loaders for dashboard cards, chart placeholders during data fetches, and meaningful empty states for new users (e.g., ”No transactions yet. Connect your bank to get started.”). 

 

D-9 | Consistent Color Coding for Amounts 

Recent Activity uses green/red color coding for income/expenses, which is good, but the Upcoming Forecast cards lack this distinction. Standardize green for income and red for expenses with consistent +/- prefixes across the entire application. 

 

D-10 | Light Mode Theme Option 

The entire app uses a dark theme with no toggle option. Add a light/dark theme toggle in Settings with system-preference auto-detection via prefers-color-scheme media query. 

 

D-11 | Budget Dashboard Visual Overhaul 

The Budget Tracker page currently shows three flat stat cards and two basic charts. Redesign this page with a more visual, engaging layout: add animated progress rings for each budget category, a spending heatmap calendar showing daily spend intensity, and color-coded budget health indicators (green/yellow/red) that give users an instant snapshot of where they stand. 

 

D-12 | Transaction Detail Drawer 

Clicking a transaction in the list currently does nothing. Design and implement a slide-out detail drawer that shows the full merchant's name, category, date, amount, running balance, a map pin for location (if available from Plaid), and the ability to add notes, tags, or receipts to a transaction. 

 

D-13 | Micro-Animations and Transitions 

The app feels static. Add subtle micro-animations to improve perceived quality: smooth page transitions between routes, count-up animations on balance numbers, chart draw-in effects on load, hover scaling on interactive cards, and gentle slide-in animations for the AI Suggestions panel. Use Framer Motion or CSS transitions to keep it performant. 

 

D-14 | Customizable Dashboard Layout 

Allow users to rearrange, resize, and hide dashboard widgets. Some users may want the AI Suggestions front and center; others may prefer the Projected Balance chart to dominate. Implement a drag-and-drop grid layout with a” Customize Dashboard" toggle and persist the layout per user. 

 

D-15 | Financial Health Score Visual 

Design a prominent Financial Health Score gauge or ring for the dashboard that synthesizes the user’s savings rate, budget adherence, debt-to-income ratio, and emergency fund status into a single 0-100 score. Use color gradients (red to green) and a simple label (e.g.,” Good," "Needs Attention") so users can immediately understand their overall financial health at a glance. 

 

D-16 | Spending Trend Sparklines 

Add inline sparkline mini charts next to each budget category in the Budget Tracker showing the spending trend over the last 3 months. Users should see at a glance whether their grocery spending is trending up; their entertainment is stable, or their utilities spiked. This provides temporal context without requiring navigation to a separate analytics page. 

 

D-17 | Sidebar Collapse and Notification Badge 

The sidebar is always fully expanded, taking up valuable screen space. Add a collapsible icon-only mode that users can toggle. Also add notification badges on sidebar items (e.g., a red dot on” Transactions" when new transactions are detected, or on "Budget Tracker" when a category exceeds its limit). 

 

Code 

C-1 | Sidebar Navigation Routing Bug 

Clicking sidebar links (e.g., “Budget Tracker”) highlights the nav item but renders Dashboard content instead of the target page. This is a client-side routing issue where the URL updates, but the view does not re-render. Investigate Next.js router behavior and test all navigation links. This is a blocking bug. 

 

C-2 | Chart Rendering Errors (Recharts) 

Console shows repeated warnings: “The width (-1) and height (-1) of chart should be greater than 0.” The Recharts library charts are rendered with negative dimensions. Fix the container CSS to ensure charts have explicit min-width and min-height values or properly configure the Responsive Container aspect prop. 

 

C-3 | Transaction Auto-Categorization 

Every transaction (actual and predicted) displays as “Uncategorized.” Implement automatic categorization using Plaid’s category data or a rules-based engine that maps merchant names to categories such as Housing, Subscriptions, Insurance, Utilities, Groceries, Auto, and Entertainment. This is required before the Budget Tracker can function properly. 

 

C-4 | Accessibility: Heading Hierarchy 

No H1 heading exists on any page. The heading structure skips from H2 to H3/H4, violating WCAG hierarchy for best practices. Each page title should be wrapped in an H1 tag. Screen readers depend on proper heading hierarchy for navigation. 

 

C-5 | Accessibility: Missing ARIA Roles 

The sidebar lacks role=” navigation” and no ARIA landmarks exist for the dashboard widget regions (chart area, recent activity, AI suggestions). Add appropriate ARIA roles and aria-label attributes throughout the application for assistive technology support. 

 

C-6 | Button Type Attributes 

All 6 buttons on the page default to type=” submit” (the HTML default). Non-form buttons must be explicitly set to type=” button” to prevent unintended form submissions and unexpected behaviors. 

 

C-7 | React Error Boundaries 

No React error boundaries detected. If any component crashes (e.g., a chart fails to render), the entire application of white screens. Wrap major sections (Dashboard widgets, Forecast Hub, Budget charts, Scenario Planner) in error boundaries with user-friendly fallback UIs. 

 

C-8 | Page Title per Route 

The browser tab always displays “Arc | AI Financial Forecaster” regardless of the active page. Update the Next.js metadata for each route to show context-specific titles (e.g., “Forecast Hub | Arc,” “Transactions | Arc”). This improves usability when users have multiple tabs open. 

 

C-9 | JavaScript Bundle Optimization 

37 script tags detected on a single page load. Audit the bundle with @next/bundle-analyzer. Implement code-splitting per route, lazy-load the Recharts library and Plaid Link SDK and remove unused dependencies to improve initial load performance. 

 

C-10 | SEO and Meta Tags 

Missing Og: image meta tag, canonical URL, and robot's directive. Add a proper Open Graph image for social sharing, canonical URLs per page, a robot's meta tag, and structured data (JSON-LD) for search engine visibility. 

 

C-11 | PWA Support 

No web app manifest, theme-color meta tag, or apple-touch-icon detected. Add Progressive Web App support so users can install Arc Predict on their home screen. This also enables push notifications for upcoming bills and low-balance alerts. 

 

Features & Updates 

F-1 | Budget Target Configuration 

The Budget Tracker shows a Monthly Target of $0.00 with no way for users to set or edit it. The progress bar displays” Spent: $945” against a $0 target at 0%, which is misleading. Build a UI for users to set overall monthly budget targets and per-category allocations. 

 

F-2 | Transaction Category Editing 

Allow users to manually re-categorize transactions by clicking on the category label in the Transactions table. Provide a dropdown or modal to select from existing categories or create custom ones. This complements auto-categorization (C-3) with manual overrides. 

 

F-3 | Expanded Settings Page 

The settings page only contains MFA security settings. Add: Profile/Display Name, Email preferences, Notification settings, Connected accounts management, Data export options, Theme preferences, and Account deletion. A complete settings page signals product maturity to users. 

 

F-4 | New User Onboarding Flow 

No guided onboarding experience exists. A new user who connects to their bank is immediately presented with a data-heavy dashboard. Build a step-by-step walkthrough that welcomes the user, explains each dashboard widget, prompts them to set a budget target, and highlights the AI-powered features. 

 

F-5 | Notifications and Alerts System 

No notification system exists. Implement alerts for: upcoming large bills (3 days before due), low balance warnings when forecast dips below a threshold, unusual spending patterns, and significant forecast changes. Support in-app notifications with optional email and push delivery. 

 

F-6 | Actionable AI Suggestions 

The AI Suggestions panel displays insights but provides no way to act on them. Add action buttons such as “View Subscriptions,” “Analyze Spending,” or “Set Reminder” that navigate users to relevant pages or create trackable action items. 

 

F-7 | Multi-Account Support 

Currently only one bank account appears connected. Most users have multiple financial accounts (checking, savings, credit cards). Add support for displaying and managing multiple linked accounts with per-account and aggregated forecast views. 

F-7.5 | Delete Accounts

Need to be able to delete accounts

F-8 | Advanced Transaction Filters 

The Transactions page has a merchant search and All/Actual/Predicted tabs but lacks date range filtering, amount range filtering, and category filtering. Add: date range picker, min/max amount inputs, category dropdown, and sortable column headers. 

 

F-9 | Transaction Table Pagination 

The Transactions page loads all records in a single long-scrolling list. Implement pagination or virtual scrolling, displaying 25-50 transactions per page with page controls, to improve performance and usability. 

 

F-10 | Expanded Scenario Planner 

The three preset scenario buttons (Car Repair $500, Vacation $2000, Job Loss) are a good start but limited. Allow users to save custom scenarios, edit preset amounts, and compare multiple scenarios side-by-side. Add presets for common events like salary raises, new subscriptions, and emergency fund goals. 

 

F-11 | Forecast Accuracy Tracking 

No indicator shows how accurate past forecasts have been. Add a Forecast Accuracy metric comparing predicted versus actual transactions. This builds user trust in the AI predictions and provides valuable data for improving the forecasting model. 

 

F-12 | Recurring Transaction Management 

The AI correctly identifies recurring transactions forecasting, but there is no user-facing UI to manage them. Add a Recurring Transactions section where users can view, edit, pause, or remove recurring patterns used in their forecast calculations. 

 

F-13 | Keyboard Navigation and Shortcuts 

No keyboard shortcuts exist. Implement navigation shortcuts (e.g., G+D for Dashboard, G+F for Forecast, “/” focus search, Esc to close modals). Ensure complete tab-navigation support with visible focus indicators for accessibility compliance. 

 

F-14 | Data Export Verification and Expansion 

The Transactions page has an Export button. Verify it functions correctly and support multiple formats (CSV, PDF, Excel). Extend export capabilities to the Forecast Hub and Budget Tracker, so users can generate financial reports. 

 

F-15 | Budget Categories with Custom Limits 

Allow users to create custom budget categories and set individual spending limits for each (e.g., Groceries: $400/mo, Dining Out: $150/mo, Entertainment: $100/mo). When a category approaches or exceeds its limit, trigger a visual warning on the Budget Tracker and optionally send a push notification. Include the ability to roll over an unused budget to the next month. 

 

F-16 | Savings Goals Tracker 

Add a dedicated Savings Goals feature where users can create named goals (e.g.,” Emergency Fund $10,000," "Vacation $3,000," "New Car $5,000") with target amounts and deadlines. Show a visual progress bar for each goal, calculate the required monthly savings rate based on the user's forecast, and use the AI to suggest realistic timelines. Integrate this with the Scenario Planner to show how each goal impacts the overall financial picture. 

 

F-17 | Bill Calendar View 

Build a visual calendar view that plots all upcoming predicted bills and recurring payments on a monthly calendar grid. Color code by category, show the daily running balance beneath each date, and let users click on any date to see what transactions are forecast for that day. This gives users a clear picture of when money leaves their account and helps them plan around paydays. 

 

F-18 | Spending Insights and Analytics Page 

Add a new ”Insights" page or section that provides deeper spending analytics: month-over-month spending comparisons by category, top 5 merchants by spend, average daily spend calculations, income vs. expenses ratio over time, and a ”spending personality" summary (e.g., "You spend most on weekends" or "Your highest spending category grew 15% this month"). This turns raw data into stories users can understand and act on. 

 

F-19 | Subscription Manager 

The AI Suggestions already identify subscriptions (Claude.AI, Spotify, Netflix). Expand this into a full Subscription Manager that auto-detects all recurring subscription charges, displays them in a dedicated view with cost, billing cycle, and next charge date. Show total monthly subscription spend, highlight price increases, flag unused or underused subscriptions, and let users set reminders before free trials expire. 

 

F-20 | AI Budget Recommendations 

Instead of requiring users to manually set budget targets, leverage the AI to analyze 2-3 months of spending history and automatically suggest personalized budget limits for each category. Present these as a” Recommended Budget" that users can accept, adjust, or dismiss. The AI should also suggest where to cut back if the user's projected spending exceeds their income, and update recommendations as spending patterns change. 

 

F-21 | Income Tracking and Paycheck Splitting 

The app focuses on expense forecasting but doesn’t provide tools for income management. Add an income tracking feature that detects paychecks, displays net income trends, and offers a "Paycheck Planner" that lets users pre-allocate each paycheck into categories (e.g., 50% needs, 30% wants, 20% savings) following popular budgeting frameworks like the 50/30/20 rule. Show a visual breakdown of how each paycheck gets allocated. 

 

F-22 | Weekly and Monthly Budget Reports 

Generate automated weekly and monthly financial summary reports delivered via email or in-app. Include: total income, total spending, spending by category, budget adherence, savings progress, forecast accuracy, and AI-generated commentary (e.g., ”You saved $200 more than last month" or "Dining out spending increased 22%"). Offer a shareable PDF version for personal records or financial advisor consultations. 

 

F-23 | Debt Payoff Planner 

The user has visible recurring debt payments (Apple Card, SoFi, Mazda Financial). Add a Debt Payoff Planner that lets users input their debts with balances, interest rates, and minimum payments. Calculate and visualize payoff timelines using debt snowball and debt avalanche strategies. Show how extra payments accelerate payoff, total interest saved, and projected debt-free date. 

 

F-24 | Spending Challenges and Streaks 

Add gamification elements to encourage better financial habits. Implement spending challenges (e.g.,” No Dining Out Week," "Stay Under $50/day for 7 days"), streak tracking for staying within budget, and achievement badges for milestones (e.g., "First Month Under Budget," "3-Month Savings Streak," "Debt-Free on a Card"). This increases engagement and helps users build long-term financial discipline. 

 

F-25 | Safe-to-Spend Daily Allowance 

Calculate and prominently display a” Safe to Spend” daily allowance on the dashboard. This number takes the current balance, subtracts all forecasted bills and savings goals for the remainder of the month, and divides by the remaining days. It answers the user’s most basic question:” How much can I spend today without getting into trouble?” Update this number in real-time as new transactions are detected. 