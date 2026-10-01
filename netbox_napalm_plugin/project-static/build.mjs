import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['js/config.ts', 'js/interface_status.ts', 'js/lldp.ts', 'js/status.ts'],
  bundle: true,
  outdir: '../static/netbox_napalm_plugin/js',
})
