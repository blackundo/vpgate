# BillGate - VPBank

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![TypeScript](https://img.shields.io/badge/language-TypeScript-blue)

**The Ultimate Automated Financial Operation Hub for VPBank Integration.**

Stop wasting hours on manual transaction checking. **BillGate - VPBank** is a comprehensive, self-hosted solution that turns your bank account into a smart, automated financial engine.


<!-- slide -->
![System Architecture](/images/image-10.png)
<!-- slide -->
![Feature Showcase 3](/images/image-6.png)
<!-- slide -->
![Feature Showcase 6](/images/image-9.png)

![Feature Showcase 1](/images/image-4.png)
<!-- slide -->
![Feature Showcase 2](/images/image-5.png)
<!-- slide -->
![Feature Showcase 4](/images/image-7.png)
<!-- slide -->
![Feature Showcase 5](/images/image-8.png)

## 🚀 Why BillGate - VPBank?

In the era of digital business, **speed** and **accuracy** are everything. Manual bank reconciliation is slow, error-prone, and kills your productivity.

We provide a **Real-time Payment Notification & Management System** that allows you to:
*   **Automate 100%** of your payment confirmations.
*   **Receive Instant Notifications** (Real-time < 2s) for every balance fluctuation.
*   **Eliminate Manual Errors** in accounting and order processing.

---

## ✨ Key Features

### 1. ⚡ Instant Payment Notification & Multi-Channel Webhooks
Never keep your customers waiting and keep your systems in sync.
*   **Real-time Tracking**: Captures balance changes the moment they happen.
*   **Multi-Channel Webhook Support**: Broadcast transaction events to multiple endpoints simultaneously (e.g., HTTPS, Telegram, etc). Configurable triggers and filters for each channel.
*   **Auto-Healing Connection**: Our "Watchdog" technology ensures 24/7 uptime. If the bank connection drops, we reconnect automatically in seconds.

### 2. 📊 Smart Business Intelligence Dashboard
Transform raw data into actionable insights.
*   **Financial Overview**: Track Total Revenue, Transaction Count, and AOV (Average Order Value) in real-time.
*   **Golden Hours Analysis**: Discover *exactly* when your customers pay you the most with our Hourly Heatmap.
*   **Keyword Extraction**: Automatically identify top-performing products or order codes from transaction content.

### 3. 🛡️ Enterprise-Grade Security & Scalability
Built for growth and security.
*   **Multi-Tenancy**: Support multiple users/shops on a single server with strict data isolation.
*   **Secure & Private**: You own your data. No third-party intermediaries reading your sensitive financial logs.
*   **Robust Architecture**: Built with **Temporal.io** for invincible workflow reliability and **PostgreSQL** for data integrity.

### 4. 🔍 Advanced Transaction Search
*   **Deep Search**: Find any transaction by content, amount, date, or note in milliseconds.
*   **Flexible Filtering**: Perfect tool for accountants to audit and reconcile books effortlessly.

---

## 🛠 Tech Stack

*   **Core**: Node.js, TypeScript
*   **Database**: PostgreSQL (Sequelize ORM)
*   **Workflow Engine**: Temporal.io
*   **Architecture**: Modular Repository Pattern

## 📦 Installation

Prerequisites: Node.js >= 18, PostgreSQL, Temporal Server.

1.  **Clone the repository**
    ```bash
    git clone https://github.com/blackundo/vpgate.git
    cd billgate
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment**
    Copy `.env.example` to `.env` and update your credentials.

4.  **Start the Server**
    ```bash
    npm run dev
    ```

## 📈 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=blackundo/vpgate&type=date&legend=top-left)](https://www.star-history.com/#blackundo/vpgate&type=date&legend=top-left)

## 📄 License

Distributed under the [MIT](LICENSE) License.

---
*Empower your business with automated financial operations.*
