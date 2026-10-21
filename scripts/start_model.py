"""Prompt privately for an API key and start the loopback workbench."""
import getpass
import os
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
if not os.environ.get('FINEVIDENCE_API_KEY'):
    os.environ['FINEVIDENCE_API_KEY']=getpass.getpass('Model API key (hidden; process only): ').strip()
from finevidence.server import main
main()
