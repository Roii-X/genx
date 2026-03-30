// ═══════════════════════════════════════════════════════════════
// Firebase Cloud Function — validateKey
// Deploy: firebase deploy --only functions
// ═══════════════════════════════════════════════════════════════
// functions/index.js
const functions = require('firebase-functions');
const admin     = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

exports.validateKey = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.set('Access-Control-Allow-Methods','POST'); res.set('Access-Control-Allow-Headers','Content-Type'); res.status(204).send(''); return; }
  
  const { key, email, hwid } = req.body || {};
  if (!key || !email || !hwid) return res.json({ status:'invalid', message:'Missing fields' });

  try {
    // Find key document
    const snap = await db.collection('licenseKeys').where('key','==',key).limit(1).get();
    if (snap.empty) return res.json({ status:'invalid', message:'Key not found' });

    const keyDoc  = snap.docs[0];
    const keyData = keyDoc.data();
    const now     = Date.now();

    // Check if admin disabled it
    if (!keyData.active) return res.json({ status:'disabled', message:'Key disabled' });

    // Check email matches
    if (keyData.email.toLowerCase() !== email.toLowerCase())
      return res.json({ status:'email_mismatch', message:'Gmail does not match this key' });

    // Check expiry
    const expMs = keyData.expireDate.toMillis();
    if (now > expMs) {
      // Also deactivate in user subscription if needed
      return res.json({ status:'expired', message:'Key expired', expiresAt: new Date(expMs).toLocaleDateString('en-GB') });
    }

    // Check device lock (usedByHwid)
    if (keyData.usedByHwid && keyData.usedByHwid !== hwid)
      return res.json({ status:'device_mismatch', message:'Key locked to a different device' });

    // First time activation: lock to this device
    if (!keyData.usedByHwid) {
      await keyDoc.ref.update({ usedByHwid: hwid, usedAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    const daysLeft = Math.max(0, Math.ceil((expMs - now) / 86400000));
    return res.json({
      status:    'active',
      plan:      keyData.plan,
      daysLeft:  daysLeft,
      expiresAt: new Date(expMs).toLocaleDateString('en-GB'),
      message:   'License valid'
    });

  } catch (err) {
    console.error(err);
    return res.json({ status:'error', message:'Server error' });
  }
});

// ── How to deploy ──
// 1. npm install -g firebase-tools
// 2. firebase login
// 3. firebase init functions   (choose your project)
// 4. paste this into functions/index.js
// 5. npm install    (inside functions/)
// 6. firebase deploy --only functions
// 7. Copy the function URL → paste into GenxLicense.cs as API constant
