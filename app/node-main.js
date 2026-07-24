// Runs in the Node context before the UI loads (NW.js "node-main").
// Old Intel AMT firmware only speaks TLS 1.0/1.1 with legacy ciphers, which
// modern Node/OpenSSL rejects by default. Relax the limits so MeshCommander
// can still reach those machines; connections are made by the user to hosts
// they manage, so this does not weaken anything security-critical here.
try {
    var tls = require('tls');
    tls.DEFAULT_MIN_VERSION = 'TLSv1';
    try { tls.DEFAULT_CIPHERS = tls.DEFAULT_CIPHERS + ':@SECLEVEL=0'; } catch (e) { }
} catch (e) {
    console.log('TLS compatibility setup failed:', e);
}

// crypto.createCipher/createDecipher were removed in modern Node, but
// MeshCommander uses them (aes-256-ctr) to obfuscate the locally stored
// computer list and certificate store. Re-implement them on top of
// createCipheriv using OpenSSL's legacy EVP_BytesToKey derivation (MD5,
// no salt, 1 round) so existing saved data keeps decrypting correctly.
try {
    var crypto = require('crypto');
    if (typeof crypto.createCipher !== 'function') {
        var evpKeyIv = function (password, keyLength, ivLength) {
            var pw = Buffer.isBuffer(password) ? password : Buffer.from(password, 'binary');
            var out = Buffer.alloc(0), prev = Buffer.alloc(0);
            while (out.length < keyLength + ivLength) {
                prev = crypto.createHash('md5').update(Buffer.concat([prev, pw])).digest();
                out = Buffer.concat([out, prev]);
            }
            return { key: out.slice(0, keyLength), iv: out.slice(keyLength, keyLength + ivLength) };
        };
        var legacy = function (fn) {
            return function (algorithm, password) {
                var info = crypto.getCipherInfo(algorithm);
                var d = evpKeyIv(password, info.keyLength, info.ivLength || 0);
                return fn(algorithm, d.key, d.iv);
            };
        };
        crypto.createCipher = legacy(crypto.createCipheriv);
        crypto.createDecipher = legacy(crypto.createDecipheriv);
    }
} catch (e) {
    console.log('crypto compatibility setup failed:', e);
}
