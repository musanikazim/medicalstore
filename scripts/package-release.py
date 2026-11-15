#!/usr/bin/env python3
"""Create a source-only ZIP. Never packages this machine's .env or database."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import urllib.parse
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {'.git', 'node_modules', 'dist', 'backups', 'test-results', 'playwright-report', '__pycache__', '.cache', '.npm', 'coverage', '.vite', 'attachments', 'secrets', 'credentials', 'releases'}
SKIP_SUFFIXES = {'.zip', '.dump', '.partial', '.log', '.pyc', '.pem', '.key', '.pfx', '.sqlite', '.sqlite3', '.db', '.backup', '.bak', '.p12', '.jks'}

def allowed(path):
    relative = path.relative_to(ROOT)
    return (not any(part in SKIP_DIRS for part in relative.parts)
            and not (path.name.startswith('.env') and path.name != '.env.example')
            and path.name not in {'.npmrc', '.netrc', '.pgpass', 'PACKAGE-MANIFEST.sha256'}
            and not path.name.endswith('.inspect.ndjson')
            and not path.name.endswith(('.sql.gz', '.sql.bz2'))
            and (path.suffix.lower() != '.sql' or relative.parts[:2] == ('prisma', 'migrations'))
            and path.suffix.lower() not in SKIP_SUFFIXES)

def secrets():
    values=[]
    file=ROOT/'.env'
    if file.exists():
        for line in file.read_text().splitlines():
            key, sep, value=line.partition('=')
            if sep and key in {'JWT_SECRET','POSTGRES_PASSWORD','SEED_ADMIN_PASSWORD','DATABASE_URL'}:
                value=value.strip().strip('\"\'')
                if value: values.append(value.encode())
                if key=='DATABASE_URL':
                    password=urllib.parse.urlsplit(value).password
                    if password: values.append(urllib.parse.unquote(password).encode())
    return [v for v in values if len(v)>=8]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',required=True,help='Destination outside the checkout or inside releases/')
    parser.add_argument('--stage-only',action='store_true')
    args=parser.parse_args()
    out=Path(args.output).resolve()
    release_root=(ROOT/'releases').resolve()
    if out==ROOT or (ROOT in out.parents and out!=release_root and release_root not in out.parents): raise SystemExit('Use releases/ or an output directory outside the checkout')
    out.mkdir(parents=True,exist_ok=True)
    stage=out/'Sehat-MedicalStore'
    if stage.parent.resolve()!=out or stage.is_symlink(): raise SystemExit('Unsafe staging target')
    if stage.exists(): raise SystemExit('Staging directory exists; choose a new output folder to preserve earlier releases')
    stage.mkdir()
    private=secrets()
    files=[]
    for directory, dirs, names in os.walk(ROOT,followlinks=False):
        dirs[:]=[d for d in dirs if d not in SKIP_DIRS]
        for name in sorted(names):
            source=Path(directory)/name
            if not allowed(source): continue
            if source.is_symlink(): raise SystemExit('Symlinks are not permitted in the release')
            data=source.read_bytes()
            if any(value in data for value in private): raise SystemExit('Private configuration value detected in an included file; release stopped')
            relative=source.relative_to(ROOT)
            target=stage/relative
            target.parent.mkdir(parents=True,exist_ok=True)
            if source.suffix.lower() in {'.ps1','.cmd'}: data=data.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')
            if source.suffix.lower()=='.sh': data=data.replace(b'\r\n',b'\n')
            target.write_bytes(data)
            files.append(relative.as_posix())
    mandatory=['package.json','package-lock.json','Dockerfile','compose.yaml','.env.example','WINDOWS-INSTALL.md','Setup-Windows.cmd','Update-Sehat.cmd','Reset-Development-Installation.cmd','Start-Sehat.cmd','Stop-Sehat.cmd','Backup-Database.cmd','Initialize-Database.cmd','Create-Administrator.cmd','server/main.ts','web/main.tsx','prisma/schema.prisma','scripts/windows/Common.ps1','docs/RELEASE-1.1.0.md','docs/DATA-IMPORT.md','docs/import-templates/Sehat-Import-Templates.xlsx']
    if any(not(stage/f).is_file() for f in mandatory): raise SystemExit('Required release file missing')
    manifest=''.join(hashlib.sha256((stage/f).read_bytes()).hexdigest()+'  '+f+'\n' for f in sorted(files))
    (stage/'PACKAGE-MANIFEST.sha256').write_text(manifest,encoding='utf-8')
    if args.stage_only:
        print('Staged source-only release: '+str(stage));return
    version=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
    archive=out/f'Sehat-MedicalStore-{version}-Complete.zip'
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for f in sorted(stage.rglob('*')):
            if f.is_file(): z.write(f,'Sehat-MedicalStore/'+f.relative_to(stage).as_posix())
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None: raise SystemExit('ZIP integrity check failed')
        for name in z.namelist():
            relative=Path(name).relative_to('Sehat-MedicalStore')
            if relative.is_absolute() or '..' in relative.parts: raise SystemExit('Unsafe archive path')
            if any(v in z.read(name) for v in private): raise SystemExit('Private value in archive')
        for line in manifest.splitlines():
            expected,name=line.split('  ',1)
            if hashlib.sha256(z.read('Sehat-MedicalStore/'+name)).hexdigest()!=expected: raise SystemExit('Manifest mismatch')
    checksum=hashlib.sha256(archive.read_bytes()).hexdigest()
    (out/(archive.name+'.sha256')).write_text(checksum+'  '+archive.name+'\n')
    print('Verified '+str(len(files)+1)+' archive files; no current credentials or database included.')
    print('ZIP: '+str(archive))
    print('Bytes: '+str(archive.stat().st_size))
    print('SHA-256: '+checksum)

if __name__=='__main__': main()
