# Jul Cracker v1.0 — Flask ZIP Password Cracker

## Setup

1. Install Python 3 if not already installed
   https://www.python.org/downloads/

2. Install dependencies:
   pip install flask

3. Run the app:
   python app.py

4. Open your browser and go to:
   http://localhost:5000

## How to Use

1. Upload your password-protected ZIP file
2. Upload your wordlist (.txt, one password per line)
3. Click [ START CRACKING ]
4. Watch the live output log
5. Password will be shown when found

## Folder Structure

julcracker/
  app.py              <- Flask backend
  requirements.txt    <- Python dependencies
  templates/
    index.html        <- Frontend UI
  uploads/            <- Temp folder (auto-created)

## Notes

- This tool is for EDUCATIONAL USE ONLY
- Use only on ZIP files you own
- RA 10175 - Cybercrime Prevention Act of the Philippines
