#!/usr/bin/env python3
"""Run a command fully detached (new session) with output to a log file: detach.py LOG cmd..."""
import os, subprocess, sys
log = open(sys.argv[1], 'w')
p = subprocess.Popen(sys.argv[2:], stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True, env=os.environ)
print(p.pid)
