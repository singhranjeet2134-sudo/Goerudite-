const articles = [
  {
    id: "account-login", roles: ["public", "school", "distributor", "retailer", "publisher", "admin", "other"], route: "/dashboard",
    title: { en: "Registering and signing in", hi: "Registration aur login" },
    questions: ["how do i log in", "create account", "dashboard nahi khul raha", "login nahi ho raha", "sign in", "register kaise kare"],
    keywords: ["login", "log in", "sign in", "register", "registration", "dashboard access", "password", "लॉगिन", "पंजीकरण", "खाता"],
    preconditions: { en: "Use the email and password registered for your own account. Account role and verification control which actions are available.", hi: "Apne account ka registered email aur password use karein. Role aur verification ke hisaab se actions milte hain." },
    steps: {
      en: ["Open the Login option in the website navigation.", "Enter your registered email and password.", "If asked, complete authenticator verification or the required MFA setup.", "After sign-in, confirm the organisation name and role shown in the dashboard."],
      hi: ["Website navigation mein Login kholiye.", "Registered email aur password enter karein.", "Agar poocha jaye, authenticator code ya required MFA setup poora karein.", "Dashboard mein organisation aur role check karein."]
    },
    expected: { en: "Your account's authorised dashboard opens. Invalid credentials do not create a signed-in session.", hi: "Aapke account ka authorised dashboard khulega. Galat credentials se valid session nahi banta." },
    limitation: { en: "Sessions are held in server memory and end when the server restarts. Email ownership verification is not implemented.", hi: "Session server memory mein hota hai aur server restart par khatam ho jata hai. Email ownership verification abhi available nahi hai." },
    escalation: { en: "If sign-in still fails, use Contact Support and provide the exact error text. Never share your password or MFA recovery codes.", hi: "Login na ho to Contact Support par exact error batayein. Password ya MFA recovery code share na karein." }
  },
  {
    id: "organisation-verification", roles: ["school", "distributor", "retailer", "publisher", "admin", "other"], route: "/dashboard",
    title: { en: "Organisation verification", hi: "Organisation verification" },
    questions: ["why account pending", "verify my organisation", "account verification", "verification pending", "account approve kaise", "pending verification"],
    keywords: ["pending", "verification", "verify", "approval", "organisation", "organization", "suspended", "correction", "सत्यापन", "लंबित"],
    preconditions: { en: "Complete the organisation profile and submit accurate information. Only Admin can make verification decisions.", hi: "Organisation profile poora aur sahi bharein. Verification ka decision sirf Admin karta hai." },
    steps: {
      en: ["Sign in and open your organisation profile.", "Complete the available required details and save them.", "Check dashboard notifications for an Admin correction request.", "If corrections are requested, update the profile and request review again."],
      hi: ["Sign in karke organisation profile kholiye.", "Zaroori details poori karke save karein.", "Admin correction request ke liye dashboard notifications dekhein.", "Correction ho to profile update karke dobara review maangein."]
    },
    expected: { en: "An Admin reviews the organisation and records a decision with a reason. Verification is separate from profile completion.", hi: "Admin reason ke saath review karke decision save karta hai. Profile completion aur verification alag hain." },
    limitation: { en: "Document-based evidence upload is not available. Pending or suspended accounts cannot perform restricted publishing actions.", hi: "Document evidence upload available nahi hai. Pending ya suspended account restricted publishing actions nahi kar sakta." },
    escalation: { en: "Contact Support if the review status needs clarification.", hi: "Status samajh na aaye to Contact Support karein." }
  },
  {
    id: "password-recovery", roles: ["public", "school", "distributor", "retailer", "publisher", "admin", "other"], route: "/forgot-password",
    title: { en: "Forgotten password", hi: "Password bhool gaye" },
    questions: ["forgot password", "reset my password", "password bhool gaya", "password reset link", "account recovery"],
    keywords: ["forgot", "password reset", "recovery", "भूला password", "पासवर्ड रीसेट"],
    preconditions: { en: "Password reset requires the account email and configured, working SMTP delivery.", hi: "Password reset ke liye account email aur configured SMTP email delivery zaroori hai." },
    steps: {
      en: ["Open Forgot your password from the login dialog.", "Enter the account email and submit the request.", "If email delivery is configured, open the one-time link and set a new password.", "Sign in again with the new password."],
      hi: ["Login dialog mein Forgot your password kholiye.", "Account email daal kar request bhejein.", "Email configured ho to one-time link se naya password set karein.", "Naye password se dobara login karein."]
    },
    expected: { en: "A successful reset link expires after 30 minutes, can be used once, and revokes existing sessions after reset.", hi: "Reset link 30 minute mein expire hota hai, ek baar use hota hai aur reset ke baad purane sessions revoke hote hain." },
    limitation: { en: "Password recovery cannot complete when SMTP is unavailable. The site uses a generic response to avoid revealing whether an account exists.", hi: "SMTP unavailable ho to reset poora nahi ho sakta. Account existence chhupane ke liye response generic hota hai." },
    escalation: { en: "If no email arrives, contact platform support. Do not send your password or reset link in a support request.", hi: "Email na aaye to platform support karein. Password ya reset link support request mein na bhejein." }
  },
  {
    id: "profile-notifications-support", roles: ["public", "school", "distributor", "retailer", "publisher", "admin", "other"], route: "/contact",
    title: { en: "Profile, notifications, and support", hi: "Profile, notifications aur support" },
    questions: ["update my profile", "notification not showing", "mark notification read", "contact support", "profile kaise update kare", "notification nahi aa rahi"],
    keywords: ["profile", "notifications", "mark read", "support request", "contact", "प्रोफाइल", "सूचना", "सहायता"],
    preconditions: { en: "Sign in to update an account profile or read account notifications. Anyone can open the public Contact page.", hi: "Profile update aur account notifications ke liye sign in karein. Contact page sabke liye khula hai." },
    steps: {
      en: ["Open the Profile or Notifications section in your dashboard.", "Edit only the fields shown for your role and save.", "Open a notification to follow its linked workflow; mark it read if that action is shown.", "For platform issues, open Contact Support and submit the support form."],
      hi: ["Dashboard mein Profile ya Notifications kholiye.", "Apne role ke fields edit karke save karein.", "Notification ke link se workflow kholiye aur option ho to read mark karein.", "Platform issue ke liye Contact Support form bhejein."]
    },
    expected: { en: "Profile changes are saved by the backend. Notification read state is per user; support submissions are stored for Admin follow-up.", hi: "Profile backend mein save hota hai. Notification read state user-wise hoti hai; support request Admin follow-up ke liye save hoti hai." },
    limitation: { en: "Profile completion does not equal organisation verification. Support email delivery and retry monitoring are not configured.", hi: "Profile complete hone ka matlab verification nahi hai. Support email delivery aur retry monitoring configured nahi hain." },
    escalation: { en: "Include the page, action, and exact error in the support request. Exclude passwords, tokens, and sensitive records.", hi: "Support request mein page, action aur exact error likhein. Password, token ya sensitive record na bhejein." }
  },
  {
    id: "catalogue-search", roles: ["public", "school", "distributor", "retailer", "publisher", "admin", "other"], route: "/catalog",
    title: { en: "Search and filter the catalogue", hi: "Catalogue search aur filters" },
    questions: ["search for a book", "find ISBN", "catalogue search", "book nahi mil rahi", "book kaise search kare"],
    keywords: ["catalogue", "catalog", "search", "filter", "sort", "ISBN", "book details", "कैटलॉग", "किताब खोज"],
    preconditions: { en: "Catalogue search is public; only published records are listed.", hi: "Catalogue search public hai; sirf published records dikhte hain." },
    steps: {
      en: ["Open Explore Catalogue.", "Search by title, publisher, or ISBN.", "Use available filters and sorting to narrow the results.", "Open a result to review its bibliographic details."],
      hi: ["Explore Catalogue kholiye.", "Title, publisher ya ISBN se search karein.", "Results kam karne ke liye filters aur sorting use karein.", "Details dekhne ke liye result kholiye."]
    },
    expected: { en: "Matching published catalogue entries appear. A school can use catalogue information while preparing a requirement.", hi: "Matching published records dikhte hain. School requirement banate waqt catalogue details use kar sakta hai." },
    limitation: { en: "Catalogue details do not confirm current stock, supplier price, or record freshness. Similar titles do not prove the same ISBN or edition.", hi: "Catalogue se current stock, supplier price ya freshness confirm nahi hoti. Similar title same ISBN ya edition hone ka proof nahi hai." },
    escalation: { en: "If a title is missing or incorrect, use Suggest a book from an authorised dashboard or Contact Support.", hi: "Book missing ya galat ho to authorised dashboard se Suggest a book karein ya Contact Support karein." }
  },
  {
    id: "school-academics-students", roles: ["school"], route: "/dashboard",
    title: { en: "Academic setup and student strength", hi: "Academic details aur student strength" },
    questions: ["set academic session", "board state medium", "student strength", "class wise students", "academic session kaise dale"],
    keywords: ["school profile", "academic session", "board", "state", "medium", "class count", "students", "शैक्षणिक सत्र", "विद्यार्थी संख्या"],
    preconditions: { en: "Sign in as a School account. These details support requirements and RFQ validation.", hi: "School account se sign in karein. Ye details book requirements aur RFQ validation mein kaam aati hain." },
    steps: {
      en: ["Open School profile and enter the organisation's academic session and applicable board, state, and medium.", "Open Academic session to confirm the session used for planning.", "Open Student strength and enter class-wise counts for the relevant session.", "Save, then review the profile-completion panel."],
      hi: ["School profile mein academic session aur lagu board, state, medium bharein.", "Planning ke session ko Academic session section mein confirm karein.", "Student strength mein relevant session ke class-wise counts daalein.", "Save karke profile-completion panel check karein."]
    },
    expected: { en: "Saved academic and class-count data is available to the School workflow and RFQ completeness checks.", hi: "Save ki hui academic aur class-count details School workflow aur RFQ completeness checks mein milti hain." },
    limitation: { en: "Multiple campuses and centrally configurable academic master data are not implemented.", hi: "Multiple campuses aur central academic master-data configuration implemented nahi hain." },
    escalation: { en: "If the backend rejects a required value, record the exact validation message and contact support.", hi: "Required value reject ho to exact validation message note karke support karein." }
  },
  {
    id: "school-requirements-import", roles: ["school"], route: "/dashboard",
    title: { en: "Book requirements and CSV/XLSX import", hi: "Book requirements aur CSV/XLSX import" },
    questions: ["upload csv school books", "xlsx import", "requirements book list", "csv upload error", "file upload nahi ho rahi", "book list import"],
    keywords: ["requirements", "import", "upload", "CSV", "XLSX", "template", "ISBN", "edition", "आयात", "फाइल"],
    preconditions: { en: "Use the School Book requirements section and its template. Upload limits and column validation apply.", hi: "School ke Book requirements section aur uske template ka use karein. Upload size, rows aur columns validate hote hain." },
    steps: {
      en: ["Download the CSV or XLSX template from Book requirements.", "Fill the required columns and check ISBN, edition, quantity, and academic details.", "Choose Import CSV / XLSX and select the completed file.", "Review all row-level errors and imported draft lines before using them in an RFQ."],
      hi: ["Book requirements se CSV ya XLSX template download karein.", "Required columns bharein; ISBN, edition, quantity aur academic details check karein.", "Import CSV / XLSX select karke file upload karein.", "Har row ka error aur imported draft review karke hi RFQ mein use karein."]
    },
    expected: { en: "Valid lines are imported as draft work for School review; import does not publish an RFQ.", hi: "Valid lines School review ke liye draft mein aati hain; import RFQ publish nahi karta." },
    limitation: { en: "Files are size/row limited; formulas and inconsistent worksheet headers are rejected. Matching titles do not auto-confirm an ISBN or edition.", hi: "File size/rows limited hain; formulas aur alag headers reject hote hain. Similar title se ISBN/edition auto-confirm nahi hota." },
    escalation: { en: "Use the provided template and share the exact row/error number with support. Do not upload sensitive files.", hi: "Template use karein aur exact row/error number support ko batayein. Sensitive file upload na karein." }
  },
  {
    id: "school-rfq-publish", roles: ["school"], route: "/dashboard",
    title: { en: "Create and publish a School RFQ", hi: "School RFQ banana aur publish karna" },
    questions: ["how do i publish an rfq", "rfq publish nahi ho rahi", "meri RFQ submit nahi ho rahi", "create rfq", "RFQ kaise banaye", "rfq draft edit"],
    keywords: ["RFQ", "publish", "draft", "requirements", "deadline", "delivery location", "rfq submit", "प्रकाशित", "आरएफक्यू"],
    preconditions: { en: "Sign in to a permitted School account. Publishing requires required academic fields, book lines, delivery location, and a valid response deadline.", hi: "Authorised School account se sign in karein. Publish karne ke liye academic fields, book lines, delivery location aur valid deadline chahiye." },
    steps: {
      en: ["Open Book requirements or My RFQs and choose Create RFQ.", "Enter the academic session and applicable board, state, and medium.", "Add and review each book line, quantity, ISBN/edition where applicable, delivery location, and response deadline.", "Save as draft and correct any backend validation errors.", "Choose Publish and check that the RFQ status changes to published."],
      hi: ["Book requirements ya My RFQs mein Create RFQ chunein.", "Academic session aur lagu board, state, medium bharein.", "Har book line, quantity, applicable ISBN/edition, delivery location aur deadline review karein.", "Draft save karke backend errors theek karein.", "Publish chunein aur status published check karein."]
    },
    expected: { en: "An eligible published RFQ can be seen by verified suppliers who meet configured territory rules. Publishing creates no purchase order.", hi: "Eligible published RFQ verified aur territory-matching suppliers ko dikhti hai. Publish karne se PO nahi banta." },
    limitation: { en: "Supplier territory is exact-match against configured text and is not validated by an authoritative geography service. Imported lines remain reviewable drafts.", hi: "Supplier territory configured text ka exact match hai, authoritative geography service nahi. Imported lines review drafts rehti hain." },
    escalation: { en: "Use the exact validation message to identify the missing field. Contact support if complete required data is still rejected.", hi: "Kaunsa field missing hai, exact validation message se dekhein. Sab sahi ho phir bhi reject ho to support karein." }
  },
  {
    id: "school-quotes-compare", roles: ["school"], route: "/dashboard",
    title: { en: "View and compare supplier quotations", hi: "Supplier quotations dekhna aur compare karna" },
    questions: ["compare quotations", "supplier quote not visible", "private quote draft", "quotation compare kaise kare", "quote nahi dikh raha"],
    keywords: ["quote", "quotation", "comparison", "supplier response", "draft private", "quote validity", "quotation comparison", "कोटेशन", "तुलना"],
    preconditions: { en: "The School must own the RFQ. A supplier quotation is visible to the School only after submission.", hi: "RFQ aapke School ki honi chahiye. Supplier quote submit hone ke baad hi School ko dikhti hai." },
    steps: {
      en: ["Open Compare quotations and select the RFQ.", "Review submitted offers, quantities, MOQ/pack constraints, charges, delivery terms, and validity.", "Use the comparison information for evaluation and record a decision if authorised.", "If a response is missing, check whether the supplier has submitted it and whether the RFQ is eligible."],
      hi: ["Compare quotations kholkar RFQ select karein.", "Submitted offers, quantities, MOQ/pack, charges, delivery terms aur validity dekhein.", "Evaluation karke authorised hon to decision record karein.", "Quote na ho to supplier submission aur RFQ eligibility check karein."]
    },
    expected: { en: "Submitted quotations for the School-owned RFQ are shown. Supplier draft quotes remain private.", hi: "School-owned RFQ ki submitted quotes dikhengi. Supplier ke draft private rehte hain." },
    limitation: { en: "An evaluation decision is not a purchase order. Comparison figures are indicative and are not invoices.", hi: "Evaluation decision PO nahi hai. Comparison totals indicative hain, invoice nahi." },
    escalation: { en: "Ask the supplier to submit a valid quote, or contact support with the RFQ reference and exact error.", hi: "Supplier se valid quote submit karne ko kahe ya RFQ reference/error ke saath support karein." }
  },
  {
    id: "school-approval-orders", roles: ["school"], route: "/dashboard",
    title: { en: "Approval workflow and purchase orders", hi: "Approval workflow aur purchase orders" },
    questions: ["purchase order approval", "why no PO created", "two approvers", "approve my request", "PO kaise banega", "approval pending"],
    keywords: ["PO", "purchase order", "approval", "approver", "requester", "manager", "owner", "खरीद आदेश", "मंजूरी"],
    preconditions: { en: "An authorised School user must request a PO from an evaluated quote. Eligible approvers must be distinct Managers or Owners.", hi: "Authorised School user evaluated quote se PO request kare. Approvers alag eligible Managers ya Owners hon." },
    steps: {
      en: ["Record the quote evaluation decision.", "Create the purchase request for the selected quotation.", "Have the first eligible non-requester approve or reject.", "If approved and policy requires two approvals, ask a different eligible person to make the second decision.", "Open Purchase orders to see the order after approval requirements pass."],
      hi: ["Quote evaluation decision record karein.", "Selected quotation ke liye purchase request banayein.", "Pehla eligible non-requester approve ya reject kare.", "Do approval zaroori ho to alag eligible vyakti second decision de.", "Approval complete hone ke baad Purchase orders check karein."]
    },
    expected: { en: "The backend issues a PO only after the required distinct approvals. Rejection closes the request without an order.", hi: "Backend required alag approvals ke baad hi PO issue karta hai. Rejection par request band, order nahi banta." },
    limitation: { en: "Custom approval matrices, substitutes, and configurable budget policy are not fully available.", hi: "Custom approval matrix, substitutes aur configurable budget policy fully available nahi hain." },
    escalation: { en: "Check each approver's organisation membership and permission profile; contact the owner/Admin if access is incorrect.", hi: "Approver ki organisation membership aur permissions check karein; access galat ho to owner/Admin se sampark karein." }
  },
  {
    id: "orders-dispatch-receipt-dispute", roles: ["school", "distributor", "retailer", "admin"], route: "/dashboard",
    title: { en: "Orders, dispatch, receipts, and disputes", hi: "Orders, dispatch, receipt aur dispute" },
    questions: ["record dispatch", "receive order", "quantity exceeds dispatched", "raise delivery dispute", "shipment tracking", "receipt kaise dale", "maal kam mila"],
    keywords: ["order", "dispatch", "shipment", "tracking", "receipt", "received quantity", "damaged", "missing", "dispute", "डिस्पैच", "रसीद", "विवाद"],
    preconditions: { en: "An authorised order must exist. Suppliers record dispatch; Schools record receipt against dispatched quantities.", hi: "Authorised order hona chahiye. Supplier dispatch aur School dispatched quantity ke against receipt record karta hai." },
    steps: {
      en: ["Open Orders / Fulfilment and select the order.", "Supplier: acknowledge or reject as applicable, then record cumulative shipment quantities and tracking.", "School: record actual received quantities after delivery.", "If items are wrong, damaged, or missing, create a dispute and provide the line and quantity details.", "Follow the supplier response and Admin decision, then close the case when appropriate."],
      hi: ["Orders / Fulfilment kholkar order select karein.", "Supplier: acknowledge/reject kare, phir cumulative shipment quantity aur tracking save kare.", "School: delivery ke baad actual received quantity daale.", "Galat, damaged ya missing item ho to line/quantity details ke saath dispute banayein.", "Supplier response aur Admin decision follow karke zarurat par case close karein."]
    },
    expected: { en: "The backend records each transition and rejects receipts above the applicable dispatched quantity.", hi: "Backend har transition record karta hai aur dispatched quantity se zyada receipt reject karta hai." },
    limitation: { en: "GoErudite does not arrange delivery, reserve inventory, settle invoices, issue refunds, or attach dispute evidence files.", hi: "GoErudite delivery arrange, inventory reserve, invoice settle, refund issue ya dispute evidence file attach nahi karta." },
    escalation: { en: "For platform errors use Contact Support. Commercial delivery/payment disputes remain between the parties.", hi: "Platform error ke liye Contact Support karein. Commercial delivery/payment dispute parties ke beech hota hai." }
  },
  {
    id: "school-reports-history", roles: ["school"], route: "/dashboard",
    title: { en: "School history and reports", hi: "School history aur reports" },
    questions: ["export report", "download school report", "rfq history", "archive", "report csv"],
    keywords: ["report", "export", "CSV", "history", "archive", "download", "रिपोर्ट", "इतिहास"],
    preconditions: { en: "Sign in to the School organisation with permission to view the relevant records.", hi: "Relevant record dekhne ki permission wale School account se sign in karein." },
    steps: { en: ["Open Reports or History & archive.", "Choose the report/export control shown for your role.", "Review the downloaded file and retain it according to your organisation's policy."], hi: ["Reports ya History & archive kholiye.", "Role ke liye dikh raha report/export control chunein.", "Downloaded file review karein aur organisation policy ke mutabik rakhein."] },
    expected: { en: "The backend returns an export scoped to the signed-in role and organisation.", hi: "Backend signed-in role aur organisation ke scope ka export deta hai." },
    limitation: { en: "A downloadable quote-comparison report and accounting reconciliation are not implemented.", hi: "Downloadable quote-comparison report aur accounting reconciliation implemented nahi hain." },
    escalation: { en: "If an expected record is missing, confirm its status and ownership before contacting support.", hi: "Record missing ho to support se pehle uska status aur ownership verify karein." }
  },
  {
    id: "supplier-rfq-eligibility", roles: ["distributor", "retailer"], route: "/dashboard",
    title: { en: "RFQ inbox and eligibility", hi: "RFQ inbox aur eligibility" },
    questions: ["rfq inbox empty", "cannot see school rfq", "eligible territory", "nearby RFQ not showing", "RFQ nahi dikh rahi", "supplier territory"],
    keywords: ["RFQ inbox", "opportunities", "territory", "verified supplier", "delivery location", "eligible", "RFQ visibility", "क्षेत्र", "अवसर"],
    preconditions: { en: "The supplier organisation must be Admin-verified and have an explicitly configured territory matching the RFQ delivery area.", hi: "Supplier organisation Admin-verified ho aur RFQ delivery area se exact match territory configured ho." },
    steps: { en: ["Check your organisation verification status in the profile/notifications.", "Open RFQ inbox or Nearby RFQs.", "Search by visible board, session, location, or title.", "If a known RFQ is missing, ask Admin to confirm your configured service area and the School delivery location."], hi: ["Profile/notifications mein verification status check karein.", "RFQ inbox ya Nearby RFQs kholiye.", "Visible board, session, location ya title se search karein.", "Known RFQ missing ho to Admin se configured service area aur School delivery location verify karayein."] },
    expected: { en: "Only published RFQs matching backend verification and territory rules are listed; direct API access is checked too.", hi: "Sirf published RFQs jo verification aur territory rules match karti hain dikhengi; direct API bhi protected hai." },
    limitation: { en: "Territories are exact configured text, not authoritative map/geography validation. Admin exceptions are scoped and temporary.", hi: "Territory configured text match hai, map/geography validation nahi. Admin exception limited aur temporary hota hai." },
    escalation: { en: "Contact your organisation owner or Admin to review verification and territory settings; do not try to bypass access controls.", hi: "Verification aur territory settings ke liye organisation owner/Admin se sampark karein; access bypass na karein." }
  },
  {
    id: "supplier-quotes", roles: ["distributor", "retailer"], route: "/dashboard",
    title: { en: "Draft and submit a supplier quotation", hi: "Supplier quotation draft aur submit" },
    questions: ["how to submit quotation", "quotation kaise bheje", "quote draft", "no bid response", "revise quote", "quotation submit error"],
    keywords: ["quotation", "quote builder", "draft", "submit quote", "MOQ", "pack size", "validity", "no bid", "कोटेशन", "बोली"],
    preconditions: { en: "Your supplier account must be verified and eligible for the RFQ. Submission requires valid commercial fields and quote validity.", hi: "Supplier account verified ho aur RFQ ke liye eligible ho. Submit karne ke liye valid commercial fields aur quote validity chahiye." },
    steps: { en: ["Open RFQ inbox and select an eligible published RFQ.", "Choose the quote builder; enter line availability, quantities, prices, MOQ/pack size, charges, delivery terms, and validity.", "Save a draft if still preparing; drafts are private from the School.", "Review validation messages, then submit the quotation or choose a valid no-bid reason.", "Use quote history to review revisions."], hi: ["RFQ inbox mein eligible published RFQ select karein.", "Quote builder mein availability, quantity, price, MOQ/pack, charges, delivery terms aur validity bharein.", "Abhi tayyar na ho to draft save karein; draft School se private hai.", "Errors theek karke quote submit karein ya valid no-bid reason chunein.", "Quote history mein revisions dekhein."] },
    expected: { en: "The submitted quote becomes visible to the School; the backend enforces line and eligibility rules.", hi: "Submitted quote School ko visible hoti hai; backend line aur eligibility rules enforce karta hai." },
    limitation: { en: "A quote is an offer record, not a confirmed sale. Inventory is not reserved and payments are not processed.", hi: "Quote offer record hai, confirmed sale nahi. Inventory reserve aur payment process nahi hota." },
    escalation: { en: "Share the RFQ reference and exact validation text with support, never private customer information.", hi: "RFQ reference aur exact validation text support ko dein; private customer info nahi." }
  },
  {
    id: "supplier-inventory-fulfilment", roles: ["distributor", "retailer"], route: "/dashboard",
    title: { en: "Inventory, imports, and supplier fulfilment", hi: "Inventory, import aur supplier fulfilment" },
    questions: ["update inventory", "search ISBN stock", "inventory csv import", "stock import error", "record order dispatch", "inventory kaise update kare"],
    keywords: ["inventory", "stock", "ISBN", "import", "export", "warehouse", "dispatch", "tracking", "inventory template", "स्टॉक", "भंडार"],
    preconditions: { en: "Inventory belongs to your organisation. Use the provided XLSX template or accepted CSV fields.", hi: "Inventory aapki organisation ka hota hai. Provided XLSX template ya accepted CSV fields use karein." },
    steps: { en: ["Open Inventory and search by title or ISBN.", "Add or adjust available, reserved, or damaged quantity with the required reason.", "For bulk changes, download the template, fill rows, import, and resolve row-specific errors.", "For an issued order, open fulfilment and record only actual cumulative shipment and tracking details."], hi: ["Inventory kholkar title ya ISBN search karein.", "Required reason ke saath available/reserved/damaged quantity add ya adjust karein.", "Bulk change ke liye template download, fill, import karein aur row errors sudharein.", "Issued order ke liye fulfilment mein actual cumulative shipment aur tracking daalein."] },
    expected: { en: "The backend saves organisation-scoped stock changes and rejects stale conflicting edits; order dispatch is recorded separately.", hi: "Backend organisation-scoped stock save karta hai aur stale conflicting edit reject karta hai; dispatch alag record hota hai." },
    limitation: { en: "Inventory entries do not reserve stock for an RFQ or PO. Multi-warehouse support and robust multi-process storage are not established.", hi: "Inventory entry RFQ/PO ke liye stock reserve nahi karti. Multi-warehouse aur multi-process storage established nahi hai." },
    escalation: { en: "Use the template and include exact row/error information when requesting support.", hi: "Template use karein; support request mein exact row/error batayein." }
  },
  {
    id: "retailer-alerts-offline", roles: ["retailer"], route: "/dashboard",
    title: { en: "Retailer stock alerts and offline drafts", hi: "Retailer stock alerts aur offline drafts" },
    questions: ["offline draft sync", "retailer offline quote", "stock alert", "low stock", "offline draft nahi dikh raha"],
    keywords: ["retailer", "offline", "draft", "sync", "stock alert", "low stock", "stale", "कम स्टॉक", "ऑफलाइन"],
    preconditions: { en: "Sign in to the Retailer dashboard. Offline quote drafts are stored only in that browser's local storage.", hi: "Retailer dashboard mein sign in karein. Offline quote draft sirf us browser ke local storage mein save hota hai." },
    steps: { en: ["Open Stock alerts to review low or stale inventory records.", "Open Offline drafts on the same browser/device where the draft was created.", "Review and resume the draft only when online, then explicitly submit it through the quote workflow.", "Confirm the server quote appears in Quote history after successful submission."], hi: ["Low/stale stock dekhne Stock alerts kholiye.", "Offline drafts usi browser/device par kholiye jahan draft banaya tha.", "Online hone par draft review/resume karke quote workflow se manually submit karein.", "Submit success ke baad Quote history mein server quote verify karein."] },
    expected: { en: "Stock alerts reflect saved inventory. An offline draft reaches the server only after an explicit online submission.", hi: "Stock alerts saved inventory par based hote hain. Offline draft server par sirf online manual submit ke baad jata hai." },
    limitation: { en: "Offline drafts do not synchronize automatically, do not resolve conflicts, and may be lost if browser storage is cleared. Repeat lists are unavailable.", hi: "Offline drafts auto-sync/conflict resolve nahi karte; browser storage clear hone par kho sakte hain. Repeat lists unavailable hain." },
    escalation: { en: "If a draft disappeared, check the original browser/device and browser storage. Contact support for server submission issues.", hi: "Draft na ho to original browser/device aur browser storage check karein. Server submit issue mein support karein." }
  },
  {
    id: "publisher-catalogue", roles: ["publisher"], route: "/dashboard",
    title: { en: "Publisher catalogue, editions, and price lists", hi: "Publisher catalogue, editions aur price lists" },
    questions: ["add publisher book", "catalogue title submission", "ISBN edition update", "MRP change", "publisher import xlsx", "price list"],
    keywords: ["publisher", "catalogue", "edition", "ISBN", "session mapping", "MRP", "price history", "import", "publisher book", "प्रकाशक", "संस्करण"],
    preconditions: { en: "Use a verified Publisher account for publishing actions. Catalogue MRP is publisher reference metadata.", hi: "Publishing actions ke liye verified Publisher account use karein. Catalogue MRP reference metadata hai." },
    steps: { en: ["Open Master catalogue to add or edit an owned title, or download the import template.", "Enter title, ISBN, edition, academic mapping, and dated reference MRP carefully.", "Save/import as draft and resolve validation issues.", "Submit the record for Admin review; review returned corrections in Catalogue review.", "Use Price lists or Editions & ISBNs to inspect the available record views."], hi: ["Master catalogue mein owned title add/edit karein ya import template download karein.", "Title, ISBN, edition, academic mapping aur dated MRP carefully bharein.", "Draft save/import karke validation issues theek karein.", "Admin review ke liye submit karein; returned correction Catalogue review mein dekhein.", "Available record views ke liye Price lists ya Editions & ISBNs kholiye."] },
    expected: { en: "The record remains private until Admin approval; approved records become public catalogue entries.", hi: "Admin approval tak record private rehta hai; approve hone par public catalogue mein aata hai." },
    limitation: { en: "MRP is not stock or a supplier quote. Full edition rollback/supersession and Publisher distributor-network authorisation are unavailable.", hi: "MRP stock ya supplier quote nahi hai. Full edition rollback/supersession aur distributor network authorisation unavailable hain." },
    escalation: { en: "Check the Admin correction reason and correct the listed field; contact support with the record reference if blocked.", hi: "Admin correction reason dekhar listed field sudharein; blocked ho to record reference ke saath support karein." }
  },
  {
    id: "publisher-review-demand", roles: ["publisher"], route: "/dashboard",
    title: { en: "Publisher corrections and demand analytics", hi: "Publisher corrections aur demand analytics" },
    questions: ["admin returned my book", "catalogue correction request", "demand analytics unavailable", "publisher demand report", "withdraw catalogue title"],
    keywords: ["correction", "review status", "withdrawal", "demand", "analytics", "three schools", "publisher review", "सुधार", "मांग"],
    preconditions: { en: "The Publisher can manage only its own records. Admin moderation determines publication and withdrawal decisions.", hi: "Publisher sirf apne records manage karta hai. Publication/withdrawal decision Admin moderation karta hai." },
    steps: { en: ["Open Catalogue review and read the status and Admin rationale.", "Correct the title record and resubmit if correction was requested.", "For a published title removal, submit a withdrawal request for Admin review.", "Open Demand analytics to see only available privacy-thresholded summaries."], hi: ["Catalogue review kholkar status aur Admin reason padhein.", "Correction maangi ho to title sudhar kar resubmit karein.", "Published title hatane ke liye Admin review withdrawal request bhejein.", "Privacy threshold poora ho to Demand analytics mein summary dekhein."] },
    expected: { en: "Corrections and withdrawals remain pending until an Admin decision. Demand is aggregated without identifying School/RFQ records.", hi: "Correction/withdrawal Admin decision tak pending rehte hain. Demand School/RFQ identity ke bina aggregate hoti hai." },
    limitation: { en: "Demand summaries require at least three distinct schools. No identifiable buyer-level demand is exposed.", hi: "Demand summary ke liye kam se kam teen alag schools chahiye. Buyer identity nahi dikhai jati." },
    escalation: { en: "Contact Admin through the review process or Contact Support; do not resubmit duplicate records without checking status.", hi: "Review process ya Contact Support use karein; status check kiye bina duplicate record na bhejein." }
  },
  {
    id: "other-user-help", roles: ["other"], route: "/dashboard",
    title: { en: "Other authorised user access", hi: "Other authorised user access" },
    questions: ["other user dashboard", "suggest book other user", "why cannot create RFQ", "permissions other account", "other authorised user"],
    keywords: ["other", "authorised", "authorized", "permissions", "book suggestion", "dashboard role", "अन्य उपयोगकर्ता"],
    preconditions: { en: "Sign in with the Other authorised user role. Available options are limited by the assigned role and permissions.", hi: "Other authorised user role se sign in karein. Options assigned role aur permissions tak limited hain." },
    steps: { en: ["Open the dashboard overview and profile.", "Use Suggest a book to submit bibliographic details for Admin review.", "Review permitted notifications and assigned activity.", "Contact the organisation owner if you believe a required permission is missing."], hi: ["Dashboard overview aur profile kholiye.", "Admin review ke liye Suggest a book se bibliographic details bhejein.", "Permitted notifications aur activity dekhein.", "Permission missing lage to organisation owner se sampark karein."] },
    expected: { en: "The account can use only permitted profile, catalogue-suggestion, notification, and assigned workflows.", hi: "Account permitted profile, book suggestion, notifications aur assigned workflows hi use kar sakta hai." },
    limitation: { en: "The Other role does not have School RFQ, supplier quote, PO, or Admin access.", hi: "Other role ko School RFQ, supplier quote, PO ya Admin access nahi milta." },
    escalation: { en: "Ask the organisation owner to review the assigned permission profile or contact support.", hi: "Assigned permission profile organisation owner se review karayein ya support karein." }
  },
  {
    id: "admin-accounts", roles: ["admin"], route: "/dashboard",
    title: { en: "Admin organisation verification and access", hi: "Admin organisation verification aur access" },
    questions: ["admin verify school", "return organisation for correction", "suspend account", "restore user", "verification reason"],
    keywords: ["admin", "verify", "suspend", "restore", "correction", "organisation review", "rationale", "प्रशासन", "निलंबित"],
    preconditions: { en: "Sign in as Admin and use a review reason of at least 10 characters for decisions.", hi: "Admin ke roop mein sign in karein; decision reason kam se kam 10 characters ka ho." },
    steps: { en: ["Open Account verification.", "Review the organisation details and current status.", "Choose verify, request correction, suspend, or restore as appropriate.", "Enter the decision reason and submit.", "Check the resulting status, audit trail, and owner notification."], hi: ["Account verification kholiye.", "Organisation details aur status review karein.", "Sahi action: verify, correction, suspend ya restore chunein.", "Decision reason likhkar submit karein.", "Naya status, audit trail aur owner notification check karein."] },
    expected: { en: "The backend applies the decision, audits it, and applies session revocation to suspended accounts.", hi: "Backend decision apply/audit karta hai aur suspended account ke sessions revoke karta hai." },
    limitation: { en: "Document evidence upload and advanced identity verification are not implemented.", hi: "Document evidence upload aur advanced identity verification implemented nahi hain." },
    escalation: { en: "For uncertain verification policy, pause and obtain the authorised business decision; do not infer evidence.", hi: "Verification policy unclear ho to authorised business decision lein; evidence assume na karein." }
  },
  {
    id: "admin-catalogue", roles: ["admin"], route: "/dashboard",
    title: { en: "Admin catalogue moderation", hi: "Admin catalogue moderation" },
    questions: ["approve publisher book", "catalogue moderation", "publish book title", "withdrawal request admin", "book suggestion review"],
    keywords: ["catalogue moderation", "approve", "publish", "correction", "discontinue", "withdrawal", "ISBN review", "मॉडरेशन"],
    preconditions: { en: "Review pending submissions and provide a meaningful decision reason.", hi: "Pending submissions review karein aur meaningful decision reason dein." },
    steps: { en: ["Open Catalogue moderation.", "Check title, ISBN/edition, academic mapping, and reference-price details.", "Choose approve, return for correction, or another available review action.", "Enter the rationale and submit.", "Verify the resulting status and public visibility only after approval."], hi: ["Catalogue moderation kholiye.", "Title, ISBN/edition, academic mapping aur reference-price check karein.", "Approve, correction ke liye return ya available review action chunein.", "Reason likhkar submit karein.", "Status aur approval ke baad public visibility verify karein."] },
    expected: { en: "The decision is audited; approved titles can appear in public catalogue search.", hi: "Decision audit hota hai; approved title public catalogue search mein aa sakta hai." },
    limitation: { en: "Approval does not verify stock or supplier price. The interface does not replace editorial review policy.", hi: "Approval stock ya supplier price verify nahi karta. Interface editorial review policy ka substitute nahi." },
    escalation: { en: "If ISBN ownership or title identity is unclear, return for evidence/correction rather than guessing.", hi: "ISBN ownership ya identity unclear ho to guess na karein; correction/evidence ke liye return karein." }
  },
  {
    id: "admin-territories", roles: ["admin"], route: "/dashboard",
    title: { en: "Admin supplier territories", hi: "Admin supplier territories" },
    questions: ["configure supplier territory", "supplier cannot see rfq admin", "territory exception", "allow supplier for rfq", "revoke territory exception"],
    keywords: ["territory", "supplier eligibility", "delivery area", "exception", "revoke", "service area", "क्षेत्र"],
    preconditions: { en: "Use reviewed location text and only grant an exception when authorised, with a reason and expiry.", hi: "Reviewed location text use karein; authorised hone par hi reason aur expiry ke saath exception dein." },
    steps: { en: ["Open Supplier territories.", "Add or update exact service-area values for the intended verified supplier.", "Check the School RFQ delivery location uses the expected normalized value.", "For a justified exception, scope it to the supplier and one RFQ, enter a reason and expiry.", "Revoke an exception when no longer needed and verify the audit record."], hi: ["Supplier territories kholiye.", "Intended verified supplier ke exact service-area values add/update karein.", "School RFQ delivery location ka expected normalized value check karein.", "Justified exception ko ek supplier aur ek RFQ tak scope karke reason/expiry daalein.", "Zaroorat khatam hone par revoke karke audit record check karein."] },
    expected: { en: "Backend RFQ visibility and quote access apply exact territory checks; exceptions are temporary and audited.", hi: "Backend RFQ visibility aur quote access par exact territory checks lagata hai; exceptions temporary aur audited hain." },
    limitation: { en: "There is no authoritative geography/serviceability provider. Do not treat free-text matching as a verified map boundary.", hi: "Authoritative geography/serviceability provider nahi hai. Free-text ko verified map boundary na samjhein." },
    escalation: { en: "Confirm business-approved service-area values with the authorised owner before configuration.", hi: "Configuration se pehle authorised owner se approved service-area values confirm karein." }
  },
  {
    id: "admin-rfq-disputes", roles: ["admin"], route: "/dashboard",
    title: { en: "Admin RFQ exceptions and disputes", hi: "Admin RFQ exceptions aur disputes" },
    questions: ["admin rfq exception", "resolve delivery dispute", "school supplier dispute admin", "rfq exception monitor"],
    keywords: ["RFQ exception", "dispute centre", "supplier response", "admin decision", "delivery issue", "विवाद", "अपवाद"],
    preconditions: { en: "Use Admin oversight for platform workflow records; do not alter a School's RFQ outside the available authorised action.", hi: "Platform workflow record ke liye Admin oversight use karein; authorised action ke bina School RFQ alter na karein." },
    steps: { en: ["Open RFQ exceptions or Dispute centre.", "Review the record, status, involved parties, and prior audit history.", "Use only the available action and record a clear reason/decision.", "Verify the updated status and notification/audit record."], hi: ["RFQ exceptions ya Dispute centre kholiye.", "Record, status, parties aur audit history dekhein.", "Available action hi use karein aur clear reason/decision record karein.", "Updated status aur notification/audit record verify karein."] },
    expected: { en: "The platform records an auditable decision or exception update.", hi: "Platform auditable decision ya exception update record karta hai." },
    limitation: { en: "Admin cannot settle commercial payments, compel a refund, arrange replacement delivery, or attach dispute evidence files.", hi: "Admin commercial payment settle, refund compel, replacement arrange ya dispute evidence attach nahi kar sakta." },
    escalation: { en: "For commercial remedies, parties must use their agreements and applicable processes; contact support for platform errors.", hi: "Commercial remedy parties ke agreement/process se hoga; platform error mein support karein." }
  },
  {
    id: "admin-support-blog-ads", roles: ["admin"], route: "/dashboard",
    title: { en: "Admin support, blog, and advertisements", hi: "Admin support, blog aur advertisements" },
    questions: ["manage support case", "publish blog", "schedule blog", "create advertisement", "ad campaign inquiry"],
    keywords: ["support cases", "blog management", "publish", "schedule", "advertisement", "campaign", "offline billing", "सहायता", "विज्ञापन"],
    preconditions: { en: "Sign in as Admin. Only publish content and campaigns after reviewing accuracy, authorisation, dates, and required fields.", hi: "Admin ke roop mein sign in karein. Accuracy, authorisation, dates aur fields review ke baad hi publish karein." },
    steps: { en: ["Open Support cases to review and update a request status.", "Open Blog management to draft, preview, publish, unpublish, or schedule an article.", "Open Advertisement management to assign an eligible advertiser, set dates/status, and save a campaign.", "Review derived click/inquiry counts and support records."], hi: ["Request status review/update ke liye Support cases kholiye.", "Blog management mein draft, preview, publish, unpublish ya schedule karein.", "Advertisement management mein eligible advertiser, dates/status set karke save karein.", "Click/inquiry counts aur support records dekhein."] },
    expected: { en: "Backend saves the Admin action and serves only published articles or active campaigns publicly.", hi: "Backend Admin action save karta hai aur public ko sirf published articles/active campaigns deta hai." },
    limitation: { en: "No online campaign payment or invoice is processed. Email support/retry monitoring is not configured; scheduled blog publication requires the server to run.", hi: "Online campaign payment/invoice nahi. Email support/retry configured nahi; scheduled blog ke liye server chalna chahiye." },
    escalation: { en: "Use support/operations procedures for failed delivery; do not mark an external payment as verified unless independently confirmed.", hi: "Delivery failure mein support/operations process use karein; external payment bina confirmation verified na mark karein." }
  },
  {
    id: "admin-audit-backup-system", roles: ["admin"], route: "/dashboard",
    title: { en: "Admin audit, backup, and system health", hi: "Admin audit, backup aur system health" },
    questions: ["verify audit log", "create backup", "restore backup", "system health dashboard", "audit integrity", "offsite backup"],
    keywords: ["audit", "integrity", "backup", "restore", "system health", "JSON store", "recovery", "सुरक्षा प्रतिलिपि", "ऑडिट"],
    preconditions: { en: "Use these actions only in the authorised environment. Restore requires the exact backup filename confirmation.", hi: "Sirf authorised environment mein use karein. Restore ke liye exact backup filename confirmation chahiye." },
    steps: { en: ["Open Audit & exports and search/filter relevant records or run the available integrity verification.", "Open Backup & recovery to inspect local backup status or create a local backup.", "For an isolated test restore, select the exact filename and confirm it exactly; verify the resulting records and audit chain.", "Use System health only as the limited application status shown."], hi: ["Audit & exports mein records search/filter karein ya integrity verification chalayein.", "Backup & recovery mein local backup status dekhein ya backup banayein.", "Isolated test restore ke liye exact filename select/confirm karke records aur audit chain verify karein.", "System health ko limited app status ke roop mein hi dekhein."] },
    expected: { en: "Local backup/restore is recorded and audit integrity can be checked with configured local keys.", hi: "Local backup/restore record hota hai aur configured local keys se audit integrity check ho sakti hai." },
    limitation: { en: "No approved off-site backup destination, managed production key custody, remote append-only logs, full monitoring, or multi-process JSON transaction guarantee is configured.", hi: "Approved off-site destination, production managed keys, remote append-only logs, full monitoring ya multi-process JSON transaction guarantee configured nahi." },
    escalation: { en: "Do not restore production data without approval, a verified backup, and an authorised rollback operator.", hi: "Approval, verified backup aur authorised rollback operator ke bina production restore na karein." }
  },
  {
    id: "unavailable-features", roles: ["public", "school", "distributor", "retailer", "publisher", "admin", "other"], route: "/contact",
    title: { en: "Unavailable or incomplete features", hi: "Unavailable ya adhoore features" },
    questions: ["permissions menu does not work", "repeat list not available", "academic configuration missing", "distributor network unavailable", "language selector", "where is feature"],
    keywords: ["not available", "unavailable", "missing feature", "disabled", "repeat lists", "permissions editor", "academic configuration", "global language", "feature not working"],
    preconditions: { en: "Some dashboard menu items are informational placeholders and do not currently have operational controls.", hi: "Kuch dashboard menu abhi information placeholder hain, operational controls nahi." },
    steps: { en: ["Check whether the section says the feature is not enabled.", "Do not rely on it to change account permissions, academic settings, repeat lists, or publisher network access.", "Use the nearest implemented workflow only if it meets your actual need.", "Report the missing feature through Contact Support."], hi: ["Section mein feature not enabled message check karein.", "Isse permissions, academic settings, repeat list ya publisher network change hone ki umeed na karein.", "Zaroorat poori ho to hi implemented alternative use karein.", "Missing feature Contact Support se report karein."] },
    expected: { en: "The chatbot will identify unavailable features instead of claiming they work.", hi: "Chatbot unavailable feature ko unavailable batayega, working hone ka galat claim nahi karega." },
    limitation: { en: "Fine-grained permission editing, repeat lists, configurable academic master data, Publisher distributor-network controls, a global website language selector, and automatic offline sync are not implemented.", hi: "Fine-grained permissions, repeat lists, configurable academic data, Publisher distributor network, global language selector aur automatic offline sync implemented nahi hain." },
    escalation: { en: "Contact Support with your role, the menu name, and the outcome you need. Do not include private credentials.", hi: "Role, menu name aur required outcome ke saath Contact Support karein. Credentials na dein." }
  }
];

module.exports = { articles };
