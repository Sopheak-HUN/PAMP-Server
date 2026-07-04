'use strict';

// Each tool lives in <root>/bin/<id>/. Every subfolder there is one installable
// version; a junction named "current" points at the active one.
//
//   exe          candidate paths (relative to a version folder) used to detect
//                a valid install and to run the tool
//   versionArgs  arguments that make the exe print its version
//   versionRegex optional override for parsing the version out of the output
//   pathDirs     dirs (relative to "current") that belong on the user PATH
//   kind         'runtime' = version switching only, 'service' = also start/stop
//   port         default listen port, used to detect externally started services

const TOOLS = [
  {
    id: 'php', name: 'PHP', kind: 'runtime', accent: '#777bb3', badge: 'PHP',
    exe: ['php.exe'], versionArgs: ['-v'], pathDirs: [''],
  },
  {
    id: 'node', name: 'Node.js', kind: 'runtime', accent: '#5fa04e', badge: 'JS',
    exe: ['node.exe'], versionArgs: ['-v'], pathDirs: [''],
  },
  {
    id: 'python', name: 'Python', kind: 'runtime', accent: '#3776ab', badge: 'PY',
    exe: ['python.exe'], versionArgs: ['--version'], pathDirs: ['', 'Scripts'],
  },
  {
    id: 'mysql', name: 'MySQL', kind: 'service', accent: '#00758f', badge: 'SQL',
    exe: ['bin\\mysqld.exe'], versionArgs: ['--version'],
    versionRegex: 'Ver\\s+([\\d.]+)', pathDirs: ['bin'], port: 3306,
  },
  {
    id: 'nginx', name: 'Nginx', kind: 'service', accent: '#009639', badge: 'NGX',
    exe: ['nginx.exe'], versionArgs: ['-v'],
    versionRegex: 'nginx/([\\d.]+)', pathDirs: [''], port: 80,
  },
  {
    id: 'dotnet', name: '.NET SDK', kind: 'runtime', accent: '#512bd4', badge: '.NET',
    exe: ['dotnet.exe'], versionArgs: ['--version'], pathDirs: [''],
  },
  {
    id: 'java', name: 'Java (JDK)', kind: 'runtime', accent: '#e76f00', badge: 'JDK',
    exe: ['bin\\java.exe'], versionArgs: ['-version'],
    versionRegex: 'version "([^"]+)"', pathDirs: ['bin'],
  },
  {
    id: 'redis', name: 'Redis', kind: 'service', accent: '#d82c20', badge: 'RDS',
    exe: ['redis-server.exe'], versionArgs: ['--version'],
    versionRegex: 'v=([\\d.]+)', pathDirs: [''], port: 6379,
  },
];

module.exports = {
  TOOLS,
  byId: (id) => TOOLS.find((t) => t.id === id),
};
