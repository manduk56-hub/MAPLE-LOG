param([long]$WindowHandle, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MapleKoreanInput {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left, top, right, bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct GUIINFO {
    public int size, flags; public IntPtr active, focus, capture, menuOwner, moveSize, caret; public RECT rect;
  }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread, ref GUIINFO info);
  [DllImport("user32.dll")] static extern int GetKeyboardLayoutList(int count, [Out] IntPtr[] layouts);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  [DllImport("imm32.dll")] static extern IntPtr ImmGetDefaultIMEWnd(IntPtr window);
  public static void Enable(long handle) {
    IntPtr window = new IntPtr(handle);
    if (GetForegroundWindow() != window) return;
    uint process; uint thread = GetWindowThreadProcessId(window, out process);
    GUIINFO info = new GUIINFO(); info.size = Marshal.SizeOf(typeof(GUIINFO));
    if (!GetGUIThreadInfo(thread, ref info) || info.focus == IntPtr.Zero) return;
    IntPtr[] layouts = new IntPtr[GetKeyboardLayoutList(0, null)];
    GetKeyboardLayoutList(layouts.Length, layouts);
    foreach (IntPtr layout in layouts) {
      if ((layout.ToInt64() & 0xffff) == 0x0412) {
        PostMessage(info.focus, 0x0050, IntPtr.Zero, layout);
        System.Threading.Thread.Sleep(80);
        break;
      }
    }
    if (GetForegroundWindow() != window) return;
    GUIINFO current = new GUIINFO(); current.size = info.size;
    if (!GetGUIThreadInfo(thread, ref current) || current.focus != info.focus) return;
    IntPtr ime = ImmGetDefaultIMEWnd(info.focus), result;
    if (ime == IntPtr.Zero) return;
    SendMessageTimeout(ime, 0x0283, new IntPtr(6), new IntPtr(1), 2, 100, out result);
    SendMessageTimeout(ime, 0x0283, new IntPtr(1), IntPtr.Zero, 2, 100, out result);
    long conversion = result.ToInt64();
    SendMessageTimeout(ime, 0x0283, new IntPtr(2), new IntPtr(conversion | 1), 2, 100, out result);
  }
}
'@
if ($CheckOnly) { Write-Output 'Korean input helper compiled.'; exit }
while (($taskInputRequest = [Console]::ReadLine()) -ne $null) {
  if ($taskInputRequest -eq 'korean') { [MapleKoreanInput]::Enable($WindowHandle) }
}
