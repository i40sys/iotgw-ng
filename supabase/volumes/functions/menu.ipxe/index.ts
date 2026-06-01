// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.177.1/http/server.ts"

serve(async () => {
  const ipxeScript = `#!ipxe

:start
set arch x86_64
set os_arch amd64
set platform efi
#set cmdline console=ttyS0,115200n8
set site_name 10.2.0.47:8000
set live_endpoint http://\${site_name}
set path /clonezilla-debian-3.1.2-9-80072992/
set sigs_enabled false
set boot_timeout 300000
iseq \${cls} serial && goto ignore_cls ||
set cls:hex 1b:5b:4a  # ANSI clear screen sequence - "^[[J"
set cls \${cls:string}

:ignore_cls
isset \${menu} && goto \${menu} ||
isset \${ip} || dhcp

:main_menu
clear menu
set space:hex 20:20
set space \${space:string}
menu Menu \${site_name} v\${version}
item --gap Default:
item local \${space} Boot from local hdd
item --gap Clonezilla:
item backup \${space} Clone disk
item restore \${space} Restore disk
item clonezilla-debian \${space} Clonezilla 3.1.2-9 Stable (Debian Based)
item --gap Tools:
item shell \${space} iPXE shell
item netinfo \${space} Network card info
item about \${space} About netboot.xyz
isset \${menu} && set timeout 0 || set timeout \${boot_timeout}
choose --timeout \${timeout} --default \${menu} menu || goto local
echo \${cls}
goto \${menu} || goto change_menu

:change_menu
chain \${menu}.ipxe || goto error
goto main_menu

:backup
set clonezilla clonezilla=backup
goto clonezilla-boot

:restore
# Display warning message and ask for confirmation
menu *** WARNING *** This will erase ALL disk data and restore from image. Continue? [y/n]
item --key y yes Proceed with disk restore.
item --key n no Cancel and return to main menu.
choose --default no --timeout 60000 confirmed && iseq \${confirmed} yes || goto cancel

# If user confirms, set parameters and proceed
set clonezilla clonezilla=restore
goto clonezilla-boot

:clonezilla-debian
set url \${live_endpoint}\${path}
kernel \${url}vmlinuz boot=live username=user union=overlay config components noswap edd=on nomodeset keyboard-layouts=es locales=en_US.UTF-8 \${ocs_params} \${extra_params} \${ocs_preload1} \${ocs_preload2} \${clonezilla} ocs_live_batch=no ocs_screen_blank="no" net.ifnames=0 nosplash noprompt fetch=\${url}filesystem.squashfs initrd=initrd.magic loglevel=7 \${cmdline}
initrd \${url}initrd
boot

:cancel
# Optional: Add any actions or messages for cancelation or return to a safe menu
echo Operation canceled by user. Returning to main menu...
sleep 3
goto main_menu # Ensure you have a :main_menu label or change this as needed

:clonezilla-boot
imgfree
echo Please, tell the machine name: (ex. m5)
read maquina_id
set ocs_params ocs_live_run="sudo /etc/rc.local"
set extra_params maquina_id=\${maquina_id}
set ocs_preload1 ocs_preload1=\${live_endpoint}/boot.tgz 
set ocs_preload2 ocs_preload2=\${live_endpoint}/\${maquina_id}.tgz
set url \${live_endpoint}\${path}
kernel \${url}vmlinuz boot=live username=user union=overlay config components noswap edd=on nomodeset keyboard-layouts=es locales=en_US.UTF-8 \${ocs_params} \${extra_params} \${ocs_preload1} \${ocs_preload2} \${clonezilla} ocs_live_batch=no ocs_screen_blank="no" net.ifnames=0 nosplash noprompt fetch=\${url}filesystem.squashfs initrd=initrd.magic loglevel=3 \${cmdline}
initrd \${url}initrd
boot

:error
echo Error occured, press any key to return to menu ...
prompt
goto main_menu

:local
echo Booting from local disks ...
exit 1

:shell
echo Type "exit" to return to menu.
set menu main_menu
shell
goto main_menu

:about
chain http://\${site_name}/functions/v1/about.ipxe
goto main_menu
`;

  return new Response(
    ipxeScript,
    { headers: { "Content-Type": "text/plain" } },
  )
})



// To invoke:
// curl 'http://localhost:<KONG_HTTP_PORT>/functions/v1/hello' \
//   --header 'Authorization: Bearer <anon/service_role API key>'
