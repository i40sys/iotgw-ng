---
theme: oriolrius
title: IoT Gateway NG + Edge Manager — The Opportunity
author: Oriol Rius
info: |
  First business meeting with an automation integrator.
  Ten slides in three chapters. Consulting and mentoring for product adoption.
colorSchema: light
aspectRatio: 16/9
canvasWidth: 1920
transition: fade
mdc: true
css: unocss
codeCopy: false
fonts:
  provider: none
drawings:
  persist: false
themeConfig:
  primary: '#FF6600'
  footer: IoT Gateway NG + Edge Manager
  pageTotal: 10
  clicker: slides
layout: cover
kicker: '01 · UNDERSTAND THE PRODUCT'
portrait: default
---

# The Opportunity

IoT Gateway NG + Edge Manager<br>Industrial infrastructure.

::meta::
Oriol Rius · oriolrius.me

::credit::
Understand the product → Discover the opportunity → Build something together

<!--
01. IoT Gateway NG + Edge Manager — The Opportunity
Chapter 1: Understand the Product. Slides 01–03.
Open the first business conversation with an automation company.
Introduce the combined product. Focus on the value of a common base for gateway infrastructure and fleet operation.
This deck presents a working MVP and business opportunities. It does not set commercial terms.
Source: source/IoT_Gateway_NG_Deck_Reunion_Negocio.md, slide 01.
-->

---
layout: concepts
cols: 2
panels: true
title: What Is It?
---

::title::
<p class="or-aside">01 · Understand the Product</p>

# What Is It?

## One platform: work at the plant, control across the fleet.

::icon1::
<i class="fas fa-microchip"></i>

::concept1::
### IoT Gateway NG

Runs at the plant on supported industrial hardware. Connects OT <> IT.

<p class="or-aside">The local execution layer.</p>

::icon2::
<i class="fas fa-network-wired"></i>

::concept2::
### Edge Manager

Provides central control of gateway setup, remote access and fleet operations.

<p class="or-aside">The central management layer.</p>

::footer::
Product reference: [iotgw.industry40.systems](https://iotgw.industry40.systems/en/)

<!--
02. What Is It?
Keep the explanation brief. IoT Gateway NG runs at the plant; Edge Manager manages the gateways.
Applications perform protocol integration and local data processing. The infrastructure supports their operation.
Hardware support depends on the target device. Avoid a claim of universal hardware compatibility.
Use the product website for detail after this short introduction.
Sources: supplied outline, slide 02; repository README.md; sites/iotgw-commercial/i18n/en.json.
-->

---
layout: concepts
cols: 3
panels: true
class: surface-mist
title: Product Maturity — An MVP with Wider Potential
---

::title::
<p class="or-aside">01 · Understand the Product</p>

# An MVP with Wider Potential

## Real needs shaped the product. New opportunities define what comes next.

::icon1::
<i class="fas fa-industry"></i>

::concept1::
### Built from real projects

We built and evolved the MVP around real customer needs and practical projects.

::icon2::
<i class="fas fa-circle-check"></i>

::concept2::
### Successful use cases

Those projects became successful use cases. Their experience continues to improve the MVP.

::icon3::
<i class="fas fa-code-branch"></i>

::concept3::
### Multiple directions

This base opens several paths: platforms for different sectors, services and business opportunities.

::footer::
One current MVP. Multiple possible platforms.

<!--
03. Product Maturity — From MVP to Real-World Adoption
The owner clarified the product story: real projects shaped and evolved the current MVP, and those projects became successful use cases.
The current product remains an MVP. The idea has wider potential than its present scope.
Use the MVP as a starting point for several possible platforms, each shaped by a different business opportunity.
The third panel describes future potential. It does not claim that those platforms already exist or promise a fixed roadmap.
No customer counts, performance metrics or named references are implied.
Sources: supplied outline, slide 03; owner’s follow-up on real use cases and multiple platform opportunities.
-->

---
layout: default
title: The Industrial Edge Ecosystem — Competitors & Complements
---

<p class="or-aside">02 · Discover the Opportunity</p>

# The Industrial Edge Ecosystem

## Competition and complement depend on the project layer.

<div class="or-table airy">

| Platform | Where projects overlap | Potential fit together |
|---|---|---|
| **Siemens Industrial Edge** | Central app and device management | Connect separate systems in a mixed plant |
| **Matrikon** | OPC connectivity and OT data integration | Use its data layer with managed gateway infrastructure |
| **Kepware** | Industrial connectivity and remote configuration | Use its protocol layer with managed host infrastructure |
| **Ignition Edge** | Local HMI, data collection and edge applications | Run compatible workloads on managed gateways |

</div>

<div class="callout mt-8">

**Position:** provide the gateway infrastructure and fleet operations around the selected application stack.

</div>

<p class="or-aside">Potential combinations require validation of OS, hardware, interfaces and licences.</p>

<!--
04. The Industrial Edge Ecosystem — Competitors & Complements
Chapter 2: Discover the Opportunity. Slides 04–08.
This table compares project layers, not prices or feature parity. Competitors also offer broader products.
The complement column is an architectural inference. No tested vendor integration or partnership is claimed.
Siemens Industrial Edge overlaps directly in central app and device management.
Matrikon and Kepware focus on industrial connectivity. Ignition Edge includes local HMI and data functions.
Confirm the exact vendor product, operating system, CPU, resource needs and licence before proposing co-deployment.
Official references checked for this deck:
Siemens: https://support.industry.siemens.com/cs/attachments/109781419/EdgeApp_PerfInsightenUS_en-US.pdf
Matrikon: https://matrikon.com/downloads/faqs/
Kepware: https://www.velotic.com/products/kepware
Ignition Edge: https://inductiveautomation.com/ignition/edge
Source structure: supplied outline, slide 04.
-->

---
layout: concepts
cols: 3
panels: true
class: surface-mist
title: Why Does This Matter to an Automation Integrator?
---

::title::
<p class="or-aside">02 · Discover the Opportunity</p>

# Why It Matters to an Integrator

## Keep the customer relationship. Build on a common operating base.

::icon1::
<i class="fas fa-layer-group"></i>

::concept1::
### Repeat the base

Reuse gateway setup and operating procedures across projects. Reduce work repeated at each site.

::icon2::
<i class="fas fa-screwdriver-wrench"></i>

::concept2::
### Extend the service

Support installed systems after commissioning. Develop recurring maintenance and fleet services.

::icon3::
<i class="fas fa-lightbulb"></i>

::concept3::
### Add your knowledge

Focus on the process, the application and the customer outcome. Build specialised solutions on the base.

::footer::
Business value to validate in the first customer project.

<!--
05. Why Does This Matter to an Automation Integrator?
Explain the proposed value for an automation business: repeat work less, extend service after installation, and apply domain knowledge.
These are value hypotheses, not measured cost savings or guaranteed revenue.
Ask which current project tasks consume the most time and where remote operations improve service.
Source: supplied outline, slide 05.
-->

---
layout: cards
cols: 2
rows: 2
title: Business Opportunities · Operations
---

::title::
<p class="or-aside">02 · Discover the Opportunity</p>

# Business Opportunities · Operations

## Managed services to protect and operate the edge infrastructure.

::icon1::
<i class="fas fa-database"></i>

::card1::
### Data Backup & Recovery

Managed backups of application data, with retention policies and tested recovery.

::icon2::
<i class="fas fa-hard-drive"></i>

::card2::
### Gateway Image Management

Central storage and management of gateway images for cloning, recovery and replacement.

::icon3::
<i class="fas fa-chart-line"></i>

::card3::
### Monitoring & Observability

A central service for gateway health, application status, logs and alerts.

::icon4::
<i class="fas fa-shield-halved"></i>

::card4::
### Private VPN Management

Managed private networks for secure access to gateways, machines and customer sites.

::footer::
Package these services as subscriptions, managed operations or project delivery.

<!--
06. Business Opportunities — Operations
Four proposed services: data backups, gateway images, monitoring and private VPN management.
Data backups protect application data. Image management covers cloning, recovery and device replacement.
Clonezilla is an example tool for the image service, subject to hardware and recovery-workflow validation. This does not claim an existing complete Clonezilla service.
These are business opportunities to develop. Agree scope, support and recovery tests before delivery.
Sources: original outline, slide 06; owner’s approved service list; backlog/decisions/decision-037 (proposed).
-->

---
layout: cards
cols: 2
rows: 2
class: surface-mist
title: Business Opportunities · Data & Solutions
---

::title::
<p class="or-aside">02 · Discover the Opportunity</p>

# Business Opportunities · Data & Solutions

## Build data services and repeatable customer solutions.

::icon1::
<i class="fas fa-diagram-project"></i>

::card1::
### Managed MQTT & Unified Namespace

Managed MQTT infrastructure and a Unified Namespace (UNS) to organise and share industrial data across systems and sites.

::icon2::
<i class="fas fa-clock-rotate-left"></i>

::card2::
### Industrial Historian & Time-Series Storage

Capture data from the UNS into a managed historian or time-series database (TSDB), with retention policies, historical queries and trend analysis.

::icon3::
<i class="fas fa-layer-group"></i>

::card3::
### Application & Solution Catalogue

A deployment catalogue for custom solutions, code and third-party software.

::icon4::
<i class="fas fa-network-wired"></i>

::card4::
### Multi-Edge Project Deployment

Reusable project templates to deploy and update coordinated solutions across multiple gateways.

::footer::
Package these services as subscriptions, managed operations or project delivery.

<!--
07. Business Opportunities — Data & Solutions
MQTT and the Unified Namespace organise and distribute industrial data. The historian or TSDB service stores data from that namespace for historical queries and analysis.
Treat these as complementary service offers. Their implementation and scope need definition for each customer.
The application catalogue covers custom solutions, code and third-party software. Komodo or Dockhand are possible deployment-tool examples, not a claim of tested integration.
Multi-edge projects coordinate several gateways and application configurations through reusable project templates.
The catalogue is a management and deployment space, not an app store.
Sources: original outline, slide 06; owner’s approved eight-service proposal, including UNS and historian/TSDB.
-->

---
layout: cards
cols: 2
rows: 2
title: More Use Cases — Where Else Could It Fit?
---

::title::
<p class="or-aside">02 · Discover the Opportunity</p>

# Where Else Could It Fit?

## Candidate use cases to explore with the integrator.

::icon1::
<i class="fas fa-industry"></i>

::card1::
### Existing production lines

Add data collection and remote service around installed equipment.

::icon2::
<i class="fas fa-gears"></i>

::card2::
### Machine builders

Use a repeatable gateway base for machines at customer sites.

::icon3::
<i class="fas fa-location-dot"></i>

::card3::
### Distributed assets

Manage gateways across energy, water or utility sites.

::icon4::
<i class="fas fa-microchip"></i>

::card4::
### Local processing

Host data processing or AI workloads on suitable hardware.

::footer::
Choose by customer need, hardware fit and service value. Validate each use case.

<!--
08. More Use Cases — Where Else Could It Fit?
These are candidate scenarios, not customer references or proven deployments.
Use them to uncover the integrator’s market access and domain knowledge.
For AI and local processing, check workload requirements, acceleration needs and resource limits.
For remote assets, check network access and operating constraints.
Source: supplied outline, slide 08. The examples develop its open use-case prompt.
-->

---
layout: concepts
cols: 2
panels: true
class: surface-mist
title: Open Source as a Business Enabler
---

::title::
<p class="or-aside">03 · Build Something Together</p>

# Open Source as a Business Enabler

## Maintain the shared base. Create value in solutions and services.

::icon1::
<i class="fab fa-github"></i>

::concept1::
### Shared product base

Keep the published base open source. Maintain common infrastructure and improve it through real projects.

::icon2::
<i class="fas fa-toolbox"></i>

::concept2::
### Your technology and service

Build specialised applications, project workflows and customer services around that base.

::footer::
Define maintenance responsibilities and review applicable licences before commercial delivery.

<!--
09. Open Source as a Business Enabler
Chapter 3: Build Something Together. Slides 09–10.
The intended model keeps the published base open source and supports business through technology and services.
Separate shared-base maintenance from customer-specific work in the discussion.
No specific repository licence grant, proprietary derivative right or redistribution permission is asserted here.
Confirm the published component licences and maintenance responsibilities as part of a concrete offer.
Source: supplied outline, slide 09.
-->

---
layout: journey
class: surface-mist
title: Let’s Turn This Into Your Product
---

::title::
<p class="or-aside">03 · Build Something Together</p>

# Let’s Turn This Into Your Product

## Combine your industry knowledge with my technical guidance to build your own offering.

::label1::
### Expert guidance

::step1::
Work with the project developer. Use a package of consulting hours to understand the platform and guide technical decisions.

::label2::
### Practical adoption

::step2::
Adapt the platform to your customer needs. Build a product offer for your catalogue and day-to-day projects.

::label3::
### Team autonomy

::step3::
Train your team through practical work. Develop the skills to use, maintain and evolve the solution towards your priorities.

::footer::
Your investment funds consulting, mentoring and knowledge transfer. The product base stays open source.

<!--
10. Partnership Vision — What I’m Looking For
Visual: one connected three-stage journey from expert guidance through practical adoption to team autonomy. The original content is unchanged.
The owner defined the relationship as a consulting and mentoring programme for clients that want to adopt the project.
Understanding, using and evolving this platform requires advanced skills across several technical areas. Guided adoption and knowledge transfer address that complexity.
The client purchases a package of consulting hours. Payment covers the accompaniment, training and technical guidance, not the software product.
The objective is a product offer in the client’s own catalogue, useful for daily projects, with an internal team capable of operating and evolving it towards its priorities.
Use the hours for learning, technical decisions and practical adoption. Define the detailed work and pace with each client.
Team autonomy is the intended outcome, not a guarantee after a fixed number of hours. The model does not imply continuous support or a transfer of software ownership.
Numeric scope, price and duration remain outside this presentation. Discuss those separately when defining a concrete engagement.
Sources: original outline, slide 10; owner’s follow-up direction on consulting, mentoring and adoption.
-->
