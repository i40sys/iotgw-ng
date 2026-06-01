// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.177.1/http/server.ts"

serve(async () => {
  const ipxeScript = `#!ipxe

:start
goto about

:about
echo =====================================
echo      Network Boot Project
echo =====================================
echo
echo Project: Clonezilla Network Boot
echo Version: 3.1.2-9
echo Server: 10.2.0.47:8000
echo
echo Description:
echo This is a network boot environment for
echo disk cloning and system management using
echo Clonezilla and iPXE technology.
echo
echo =====================================
echo
echo Press any key to return...
prompt
exit 0
`;

  return new Response(
    ipxeScript,
    { headers: { "Content-Type": "text/plain" } },
  )
})



// To invoke:
// curl 'http://localhost:<KONG_HTTP_PORT>/functions/v1/hello' \
//   --header 'Authorization: Bearer <anon/service_role API key>'
