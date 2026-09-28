' Launches the watchdog with no visible window. Used as the scheduled task action,
' because console executables started directly by Task Scheduler flash a window.
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & here & "\remote-anything-watchdog.ps1"""
shell.Run command, 0, False
