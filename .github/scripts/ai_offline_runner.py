#!/usr/bin/env python3
"""Deterministic offline two-agent handover runner.

No network, API key, GitHub write, deployment or paid request capability.
"""
import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from ai_transport_contract import Exchange, build_request

MAX_ROUNDS = 2
MAX_MESSAGE_BYTES = 16000

@dataclass(frozen=True)
class Turn:
    round: int
    from_agent: str
    to_agent: str
    message: str

def run_handover(task, claude_reply, openai_reply):
    if not isinstance(task, str) or not task.strip() or len(task.encode()) > MAX_MESSAGE_BYTES:
        raise ValueError("Task must be nonempty and <= 16000 UTF-8 bytes")
    if not all(isinstance(x, str) and x.strip() and len(x.encode()) <= MAX_MESSAGE_BYTES for x in (claude_reply, openai_reply)):
        raise ValueError("Replies must be nonempty and <= 16000 UTF-8 bytes")
    turns = [
        Turn(1,"founder","claude",task),
        Turn(1,"claude","openai",claude_reply),
        Turn(2,"openai","founder",openai_reply),
    ]
    requests = [
        build_request(Exchange("anthropic","MODEL_NOT_CONFIGURED",task,256)),
        build_request(Exchange("openai","MODEL_NOT_CONFIGURED",claude_reply,256)),
    ]
    return {"mode":"offline_only","paid_calls_enabled":False,"max_rounds":MAX_ROUNDS,
            "turns":[asdict(t) for t in turns],"request_previews":requests,
            "status":"REVIEW","next_action":"Founder decides; no automatic implementation"}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--task",default="Investigate a proposed CLPeasy issue, without making changes.")
    parser.add_argument("--claude-reply",default="Evidence reviewed; recommend founder review.")
    parser.add_argument("--openai-reply",default="REVIEW: independent evidence required before changes.")
    parser.add_argument("--output",default="")
    args=parser.parse_args()
    result=run_handover(args.task,args.claude_reply,args.openai_reply)
    rendered=json.dumps(result,indent=2)
    if args.output:
        path=Path(args.output)
        path.write_text(rendered+"\n",encoding="utf-8")
    else:
        print(rendered)

if __name__=="__main__":
    main()
