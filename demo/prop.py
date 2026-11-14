"""Print an issue property: python3 prop.py CLSD-7 sidebar-debug"""
import json
import sys

sys.argv, args = sys.argv[:1], sys.argv[1:]
exec(open(__file__.replace("prop.py", "seed.py")).read().split("if __name__")[0])
print(json.dumps(call("GET", f"/rest/api/3/issue/{args[0]}/properties/{args[1]}").get("value"), indent=1)[:3000])
