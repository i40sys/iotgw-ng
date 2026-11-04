'use strict';

import { cursor } from 'uci';

// IoT Gateway NG: the product identity shown instead of the OpenWrt hostname.
// Override per device in /etc/config/argon (product_name, product_tagline).
const DEFAULT_NAME = 'IoT GW NG';
const DEFAULT_TAGLINE = 'Edge Console';

function clean(value, fallback) {
	if (type(value) != 'string')
		return fallback;
	value = trim(striptags(value));
	return (length(value) > 0 && length(value) <= 40) ? value : fallback;
}

export function get_product() {
	const cfg = cursor();
	return {
		name: clean(cfg.get_first('argon', 'global', 'product_name'), DEFAULT_NAME),
		tagline: clean(cfg.get_first('argon', 'global', 'product_tagline'), DEFAULT_TAGLINE)
	};
};
