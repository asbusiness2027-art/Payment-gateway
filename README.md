# بوابة الدفع (Sandbox) - ISO 8583

تشغيل: `node server.js` ثم افتح http://localhost:3000 (لا يحتاج npm install).

## الملفات
- `protocol101_1.js`  طبقة البروتوكول: **هنا بس** تتعدل لما توصلك مواصفات 101.1 الحقيقية.
- `iso8583.js`        بناء/تفكيك رسائل ISO 8583 (جدول SPEC للحقول).
- `transport.js`      بنك وهمي للتجربة، و TCP حقيقي لو حطيت ACQUIRER_HOST و ACQUIRER_PORT.
- `gateway.js`        التحقق (Luhn)، الأونلاين/الأوفلاين، المزامنة، التشفير.
- `server.js`         الـ API + اللوحة.

## API (الهيدر x-api-key)
- POST /api/pay {pan, expiry:"MM/YY", amount}
- GET /api/transactions
- POST /api/sync
- POST /api/network {online:true|false}  (للتجربة)

## قواعد البنك الوهمي
مبلغ > 50,000 => 51 | كارت ينتهي 0000 => 05 | ينتهي 1111 => 91 | غير كده 00.
أوفلاين: بيتقبل لحد OFFLINE_FLOOR_LIMIT (500 جنيه) ويتبعت كـ 0220 عند رجوع الاتصال.
كارت تجربة: 4242424242424242

## متغيرات البيئة
API_KEY, VAULT_KEY, PORT, OFFLINE_FLOOR_LIMIT, POS_ENTRY_MODE, TERMINAL_ID, MERCHANT_ID, ACQUIRER_HOST, ACQUIRER_PORT

## أمان (مهم)
- الداتا بتخزن أول 6 وآخر 4 فقط. الرقم الكامل بيتشفّر AES-256-GCM لحد المزامنة وبعدها يتمسح. CVV مش بيتقبل ولا بيتخزن.
- ده مش بديل لـ PCI DSS. قبل أي كروت حقيقية لازم: HTTPS، تغيير API_KEY و VAULT_KEY، تقييم PCI، واتفاقية مع بنك/مزوّد.
