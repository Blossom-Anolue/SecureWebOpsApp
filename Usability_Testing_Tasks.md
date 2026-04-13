# Usability Testing Tasks: SecureWebOps Platform

## Task 1: Execute and Analyze a Security Scan
**Functionalities/Use Cases Mapped To:**
*   Create/Initiate a New Vulnerability Scan (ZAP Integration)
*   Monitor Scan Progress
*   Review Scan Detailed Findings (Vulnerabilities, Severity)
*   Dashboard Analytics & Security Score impact

**Detailed Start-up State & Data Needs:**
*   **Start-up State:** User is logged into the application and is currently on the main Dashboard page.
*   **Data Needs:** The facilitator must provide the user with a designated "safe" URL to scan (e.g., `http://staging-test-env.internal` or a deliberately vulnerable test app URL like `http://testphp.vulnweb.com`).

**Task Description (To be read to the user):**
> "You are the security lead for your organization. You've just deployed a new staging environment for your company's main web application and need to ensure it doesn't have any glaring vulnerabilities before a major release.
>
> Please use the platform to initiate a new security scan on the staging URL provided to you on your desk (`http://staging-test-env.internal`). Once the scan finishes, locate the most critical vulnerability the system found and review its details. Finally, check the main dashboard to see how this recent scan has affected your organization's overall security score or trend."

## Task 2: Securely Encrypt and Share a Confidential Document
**Functionalities/Use Cases Mapped To:**
*   PDF Encryption (`PDFEncryption.tsx`)
*   Secure Vault Management (`SecureVault.tsx`)
*   Secure File Sharing & Access Control (`FileSharing.tsx`)

**Detailed Start-up State & Data Needs:**
*   **Start-up State:** User is logged in and is currently on the Dashboard or Home page.
*   **Data Needs:**
    *   A sample dummy PDF file named `Q3_Financial_Report.pdf` placed on the tester's desktop.
    *   A recipient email address (e.g., `external.auditor@example.com`).

**Task Description (To be read to the user):**
> "Your finance department has just finalized the Q3 earnings report, and you need to securely send it to an external auditor. The document contains highly sensitive financial data and cannot be sent via standard email.
>
> Use the platform to securely encrypt the 'Q3_Financial_Report.pdf' file located on your desktop. After encrypting it, share the securely encrypted document specifically with the auditor at 'external.auditor@example.com'. Finally, navigate to your Secure Vault to verify that the document is safely stored and listed as shared."

## Task 3: Investigate a Suspicious Email for Phishing
**Functionalities/Use Cases Mapped To:**
*   Phishing Content Analysis (`PhishingCheck.tsx`)
*   Reviewing Historical Threat Data (`PhishingHistory.tsx`)

**Detailed Start-up State & Data Needs:**
*   **Start-up State:** User is logged in and is currently on the Dashboard page.
*   **Data Needs:** A text file on the desktop named `Suspicious_Email.txt` containing the raw text of a simulated phishing email (e.g., a fake IT password reset request).

**Task Description (To be read to the user):**
> "An employee has forwarded you a highly suspicious email claiming to be from your IT department, urging them to click a link to immediately reset their password. You need to determine if this is a malicious phishing attempt.
>
> Using the web application, input the contents of the suspicious email (which you can copy from the 'Suspicious_Email.txt' file on your desktop) to analyze it for threats. Once the analysis is complete, identify the threat level the system assigns to it. After that, verify that this specific check has been successfully logged in your organization's phishing history."

## Task 4: Onboard a New Team Member and Audit Activity
**Functionalities/Use Cases Mapped To:**
*   Team Management & Role Assignment (`Team.tsx`)
*   System Audit Logging (`ActivityLog.tsx`, `useActivityLog.ts`)
*   Organization Management Settings

**Detailed Start-up State & Data Needs:**
*   **Start-up State:** User is logged in with an **Admin** account and is on the Dashboard page.
*   **Data Needs:** A dummy email address for the new hire (e.g., `j.doe@company.com`).

**Task Description (To be read to the user):**
> "Your organization has just hired a new Junior Security Analyst, Jane Doe. You need to give her access to the SecureWebOps platform so she can start reviewing security scans, but you want to ensure she doesn't have administrative rights to alter system settings.
>
> Please invite 'j.doe@company.com' to your team and ensure she is assigned a restricted role (such as 'Viewer' or 'Analyst'). After sending the invitation, navigate to the system's Activity Log to verify that your action of inviting this new user was properly recorded by the system for auditing purposes."
