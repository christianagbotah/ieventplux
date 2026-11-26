#!/usr/bin/env python3
"""Actual Android emulator screen capture and accessibility-tree smoke.

This checks a synthetic read-only visual fixture, not production API correctness,
device certification or final aesthetic approval.
"""
import pathlib
import re
import struct
import subprocess
import time
import xml.etree.ElementTree as ET

PACKAGE="com.lightworld.ieventplux.visualqa"
OUT=pathlib.Path("android-visual-qa")
OUT.mkdir(exist_ok=True)

def adb(*args, timeout=40):
    return subprocess.check_output(["adb",*args],timeout=timeout)

def shell(*args):
    return adb("shell",*args).decode(errors="replace")

def tree():
    shell("uiautomator","dump","/sdcard/ieventplux-qa.xml")
    return ET.fromstring(adb("exec-out","cat","/sdcard/ieventplux-qa.xml"))

def bounds(node):
    values=list(map(int,re.findall(r"\d+",node.attrib.get("bounds",""))))
    if len(values)!=4 or values[2]<=values[0] or values[3]<=values[1]:
        return None
    return values

def find(root, label, contains=False):
    for node in root.iter("node"):
        vals=[node.attrib.get("text",""),node.attrib.get("content-desc","")]
        if any(label in value if contains else label==value for value in vals) and bounds(node):
            return node
    return None

def wait(label, timeout=45, contains=False):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        try:
            node=find(tree(),label,contains)
            if node is not None:
                return node
        except (ET.ParseError,subprocess.SubprocessError):
            pass
        time.sleep(1)
    raise AssertionError("Missing visible native control: "+label)

def tap(node):
    x1,y1,x2,y2=bounds(node)
    shell("input","tap",str((x1+x2)//2),str((y1+y2)//2))

def capture(name, width, height):
    data=adb("exec-out","screencap","-p")
    if data[:8]!=b"\x89PNG\r\n\x1a\n":
        raise AssertionError("Invalid emulator screenshot")
    actual=struct.unpack(">II",data[16:24])
    if actual!=(width,height):
        raise AssertionError("Unexpected physical viewport "+str(actual))
    (OUT/(name+".png")).write_bytes(data)
    root=tree()
    (OUT/(name+".xml")).write_bytes(ET.tostring(root,encoding="utf-8"))
    return root

def within(node,w,h):
    x1,y1,x2,y2=bounds(node)
    if not (0<=x1<x2<=w and 0<=y1<y2<=h):
        raise AssertionError("Native element outside viewport: "+str(node.attrib))

def scroll_until(label,w,h):
    for _ in range(10):
        try:
            node=find(tree(),label,True)
            if node is not None:return node
        except (ET.ParseError,subprocess.SubprocessError):
            pass
        shell("input","swipe",str(w//2),str(int(h*.76)),str(w//2),str(int(h*.34)),"450")
        time.sleep(.5)
    raise AssertionError("Unable to find scrollable content: "+label)

def launch():
    shell("am","force-stop",PACKAGE)
    shell("monkey","-p",PACKAGE,"-c","android.intent.category.LAUNCHER","1")

def scenario(tag,width,height,font_scale):
    shell("wm","size",f"{width}x{height}")
    shell("wm","density","320")
    shell("settings","put","system","font_scale",str(font_scale))
    launch()
    search=wait("Search events")
    within(search,width,height)
    if bounds(search)[1]>height*.45:
        raise AssertionError("Search should be near the top of Discover")
    account=wait("Account")
    within(account,width,height)
    root=capture(tag+"-discover",width,height)
    assert find(root,"Search events") is not None
    tap(account)
    wait("Welcome back")
    wait("Password",contains=True)
    capture(tag+"-login",width,height)
    shell("input","keyevent","4")
    wait("Search events")
    # Scroll to the actual feature card (not a rotating hero shortcut).
    featured=scroll_until("View featured event City Culture Weekend",width,height)
    tap(featured)
    wait("City Culture Weekend",contains=True)
    capture(tag+"-event",width,height)
    scroll_until("Tickets & entry",width,height)
    capture(tag+"-tickets",width,height)
    print("ANDROID_VISUAL_SMOKE_PASS",tag,flush=True)

if __name__=="__main__":
    try:
        scenario("320dp-normal",640,1440,1.0)
        scenario("390dp-normal",780,1688,1.0)
        scenario("390dp-large-text",780,1688,1.5)
    except Exception:
        try:
            (OUT/"failure.png").write_bytes(adb("exec-out","screencap","-p"))
            (OUT/"failure.xml").write_bytes(ET.tostring(tree(),encoding="utf-8"))
        except Exception:
            pass
        raise
    finally:
        shell("am","force-stop",PACKAGE)
        shell("wm","size","reset")
        shell("wm","density","reset")
        shell("settings","put","system","font_scale","1.0")
