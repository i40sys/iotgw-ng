SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- Dumped from database version 15.8
-- Dumped by pg_dump version 15.8

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: domains; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."domains" ("id", "name", "display_name", "created_at") VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'production', 'Production Environment', '2025-06-03 05:00:00+00'),
('b2c3d4e5-f6a7-8901-bcde-f23456789012', 'office', 'Office Network', '2025-06-03 05:00:00+00'),
('c3d4e5f6-a7b8-9012-cdef-345678901234', 'warehouse', 'Warehouse Systems', '2025-06-03 05:00:00+00'),
('3641d80c-7e58-43c4-9826-4e7be52d0afd', 'sabat', 'Sàbat', '2025-12-03 05:30:35.837815+00');

--
-- Data for Name: networks; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."networks" ("id", "domain_id", "name", "ipv4_cidr", "ipv6_cidr", "created_at") VALUES
('d4e5f6a7-b8c9-0123-defa-456789012345', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Production Floor 1', '192.168.1.0/24', NULL, '2025-06-03 05:10:00+00'),
('e5f6a7b8-c9d0-1234-efab-567890123456', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Production Floor 2', '192.168.2.0/24', NULL, '2025-06-03 05:10:00+00'),
('f6a7b8c9-d0e1-2345-fabc-678901234567', 'b2c3d4e5-f6a7-8901-bcde-f23456789012', 'Office Main', '10.1.0.0/16', NULL, '2025-06-03 05:10:00+00'),
('a7b8c9d0-e1f2-3456-abcd-789012345678', 'b2c3d4e5-f6a7-8901-bcde-f23456789012', 'Office Guest', '10.2.0.0/16', NULL, '2025-06-03 05:10:00+00'),
('b8c9d0e1-f2a3-4567-bcde-890123456789', 'c3d4e5f6-a7b8-9012-cdef-345678901234', 'Warehouse IoT', '172.16.0.0/16', NULL, '2025-06-03 05:10:00+00'),
('951dfe21-4de9-46a7-947d-8569bf1a8aba', '3641d80c-7e58-43c4-9826-4e7be52d0afd', 'm1', '10.121.101.0/24', NULL, '2025-12-03 05:30:35.837815+00');

--
-- Data for Name: device_creation_log; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: devices; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."devices" ("id", "network_id", "name", "description", "ip_address", "private_key", "public_key", "totp_counter", "created_at") VALUES
('b5b50268-b4bc-46b6-898a-315bc80de7a4', 'd4e5f6a7-b8c9-0123-defa-456789012345', 'iot-gateway-floor1', 'Main production floor IoT gateway', '192.168.1.10', NULL, NULL, 0, '2025-06-03 05:21:22.567844+00'),
('8f928aec-eb3c-49fe-8fcb-2fcf79abd74f', 'e5f6a7b8-c9d0-1234-efab-567890123456', 'iot-gateway-floor2', 'Secondary production floor gateway', '192.168.2.20', NULL, NULL, 0, '2025-06-03 05:21:22.567844+00'),
('ca4d0b74-2d96-4f44-b856-73b58b031109', 'b8c9d0e1-f2a3-4567-bcde-890123456789', 'iot-gateway-warehouse', 'Warehouse monitoring system', '172.16.1.30', NULL, NULL, 0, '2025-06-03 05:21:22.567844+00'),
('3b24c1d8-8c0e-4ab8-a030-464878e8418b', 'd4e5f6a7-b8c9-0123-defa-456789012345', 'iot-gateway-parking', 'Parking area sensor gateway', '192.168.1.40', NULL, NULL, 0, '2025-06-03 05:21:22.567844+00'),
('530c0977-ee46-4b43-a21e-fd3f7b21904b', 'd4e5f6a7-b8c9-0123-defa-456789012345', 'iot-gateway-building-a', 'Building A environment monitoring', '192.168.1.50', NULL, NULL, 0, '2025-06-03 05:21:22.567844+00'),
('6fb3c9f7-b939-4129-aa71-60d276041807', 'e5f6a7b8-c9d0-1234-efab-567890123456', 'iot-gateway-building-b', 'Building B environment monitoring', '192.168.2.60', NULL, NULL, 0, '2025-06-03 05:21:22.567844+00'),
('dcbb3f8e-bf98-40f2-bca9-8da1435ac033', 'd4e5f6a7-b8c9-0123-defa-456789012345', 'iot-gateway-production', 'Main production line controller', '192.168.1.70', NULL, NULL, 0, '2025-06-03 05:21:22.567844+00'),
('2efc7d19-e2ed-4241-a5e8-54619e58dbd9', 'f6a7b8c9-d0e1-2345-fabc-678901234567', 'iot-gateway-lab', 'R&D lab test gateway', '10.1.1.80', NULL, NULL, 0, '2025-06-03 05:21:22.567844+00'),
('07330cfb-920b-4a79-b8bf-a3de6a00a85e', 'f6a7b8c9-d0e1-2345-fabc-678901234567', 'iot-gateway-office', 'Office automation gateway', '10.1.1.90', NULL, NULL, 0, '2025-06-03 05:21:22.567844+00'),
('ea823fca-7072-4e8f-9a37-29c0a98a22a4', 'a7b8c9d0-e1f2-3456-abcd-789012345678', 'iot-gateway-datacenter', 'Datacenter environmental monitoring', '10.2.0.210', 'encrypted_private_key_here', 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC...', 0, '2025-06-03 05:21:22.567844+00'),
('0a532ab7-2549-465b-ab29-27403dfe5603', '951dfe21-4de9-46a7-947d-8569bf1a8aba', 'iotgw-m1', NULL, '10.121.101.254', 'redacted_private_key_placeholder', 'redacted_public_key_placeholder', 5, '2025-12-03 05:33:21.330211+00');

--
-- PostgreSQL database dump complete
--
