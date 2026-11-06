Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.StartPosition = 'CenterScreen'
$owner.Size = New-Object System.Drawing.Size(1,1)
$owner.Opacity = 0
$owner.Show()
$owner.Activate()
$dlg = New-Object System.Windows.Forms.SaveFileDialog
$dlg.Title = 'Guardar PDF'
$dlg.Filter = 'PDF (*.pdf)|*.pdf'
$dlg.InitialDirectory = $env:RC_DIR
$dlg.FileName = $env:RC_NAME
$dlg.OverwritePrompt = $true
if ($env:RC_TEST -eq '1') {
  $t = New-Object System.Windows.Forms.Timer
  $t.Interval = 1500
  $t.Add_Tick({ $t.Stop(); [System.Windows.Forms.SendKeys]::SendWait('{ESC}') })
  $t.Start()
}
if ($dlg.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output $dlg.FileName
} else {
  Write-Output 'CANCEL'
}
$owner.Close()
