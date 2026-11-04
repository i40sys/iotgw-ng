"""Render only authored, non-sensitive architecture illustrations via plantuml.joor.net."""
from pathlib import Path
import json, urllib.request, concurrent.futures
ROOT=Path(__file__).resolve().parents[1]/'dist'/'assets'
STYLE='''@startuml
skinparam backgroundColor transparent
skinparam defaultFontName SansSerif
skinparam defaultFontSize 15
skinparam defaultFontColor #151652
skinparam shadowing false
skinparam roundcorner 12
skinparam ArrowColor #FF6600
skinparam ArrowThickness 2
skinparam nodesep 45
skinparam ranksep 45
skinparam rectangle {\n BackgroundColor #F4F4F4\n BorderColor #D8D9E1\n FontColor #151652\n}
skinparam package {\n BackgroundColor #FFFFFF\n BorderColor #D8D9E1\n FontColor #151652\n}
skinparam componentStyle rectangle
skinparam sequence {\n ParticipantBackgroundColor #F4F4F4\n ParticipantBorderColor #D8D9E1\n LifeLineBorderColor #D8D9E1\n ArrowColor #FF6600\n}
'''
DIAGRAMS={
'overview':r'''left to right direction
rectangle "PLANTA\nPLC · sensors · màquines" as OT
rectangle "IoT Gateway NG\nConnectar · processar · gestionar" as GW #FFF0E5
rectangle "SISTEMES DE DADES\nMQTT · aplicacions · analítica" as IT
OT --> GW : dades
GW --> IT : informació útil
''',
'architecture':r'''left to right direction
package "01  PLANTA · OT" {
 rectangle "PLC i sensors\nProtocols de cada equip" as plc
 rectangle "Xarxa industrial\nAccés definit amb OT" as lan
 plc --> lan
}
package "02  EDGE · IoT Gateway NG" {
 rectangle "Integració local\nNode-RED + connectors" as flows #FFF0E5
 rectangle "Missatgeria\nMosquitto · MQTT" as mqtt #FFF0E5
 rectangle "Serveis del gateway\nAplicacions en contenidors" as apps
 flows --> mqtt
 flows -down-> apps
}
package "03  IT · SERVEIS" {
 rectangle "Broker central\nEMQX, si s'habilita el pont" as broker
 rectangle "Consumidors\nQuadres de comandament\ni aplicacions integrades" as data
 broker --> data
}
lan --> flows : lectura configurada
mqtt --> broker : topics seleccionats
''',
'access':r'''left to right direction
actor "Equip tècnic\nautoritzat" as op
rectangle "Punt d'accés\nBastió de gestió" as bastion
rectangle "Gateway\nIdentitat pròpia" as gw #FFF0E5
rectangle "Xarxa OT\nRutes i regles acordades" as ot
op --> bastion : sessió autenticada
bastion --> gw : VPN WireGuard\n+ SSH amb certificats
gw ..> ot : només l'accés\nconfigurat
note bottom of gw
El túnel protegeix el transport.
L'abast OT es defineix a la xarxa.
end note
''',
'deployment':r'''skinparam activity {\n BackgroundColor #FFF0E5\n BorderColor #FF6600\n DiamondBackgroundColor #F4F4F4\n DiamondBorderColor #D8D9E1\n}
start
:Registrar el gateway\ni preparar la configuració;
:Arrencar l'entorn live\nper xarxa;
:Autoritzar l'alta\ni establir la connexió;
:Instal·lar OpenWRT\ni reiniciar;
:Desplegar els serveis\namb Kestra + Ansible;
:Comprovar connectivitat\ni revisar el resultat;
stop
''',
'fleet':r'''top to bottom direction
rectangle "Domini\nUna agrupació de gestió" as domain #FFF0E5
rectangle "Xarxa · planta A" as na
rectangle "Xarxa · planta B" as nb
rectangle "Gateway A1\nConfiguració + estat" as a
rectangle "Gateway A2\nConfiguració + estat" as b
rectangle "Gateway B1\nConfiguració + estat" as c
domain --> na
domain --> nb
na --> a
na --> b
nb --> c
''',
'dataflow':r'''hide footbox
participant "Màquina" as m
participant "Node-RED\nal gateway" as n
participant "MQTT local\nMosquitto" as q
participant "Sistemes\nde dades" as d
m -> n : 1. Llegir una variable
n -> n : 2. Donar format i context
n -> q : 3. Publicar el missatge
q -> d : 4. Reenviar si s'ha configurat
note over m,d : Exemple d'integració; connectors, freqüència i destí es defineixen al projecte.
'''}
def render(item):
 name,body=item; body=body.replace(' {\\n', ' {\n').replace('\\n Background', '\n Background').replace('\\n Border', '\n Border').replace('\\n Diamond', '\n Diamond').replace('\\n}', '\n}'); source=STYLE+body+'\n@enduml\n'; (ROOT/(name+'.puml')).write_text(source)
 req=urllib.request.Request('https://plantuml.joor.net/api/v1/render',data=json.dumps({'source':source,'format':'svg'}).encode(),headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=60) as r: svg=r.read()
 if b'<svg' not in svg or b'Syntax Error' in svg: raise RuntimeError(name+' failed')
 (ROOT/(name+'.svg')).write_bytes(svg);return name,len(svg)
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for result in pool.map(render,DIAGRAMS.items()): print(*result)
