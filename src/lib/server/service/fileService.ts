import * as fs from 'fs';

type POSSIBLE_SERVICES = 'CHARACTER' | 'DYNASTY' | 'USER' | 'BUILDING';
const PATH = 'static/';

export function read(service: POSSIBLE_SERVICES, callback: (err: any, data: Buffer<ArrayBufferLike>) => void) {
	fs.readFile(PATH + service + '.txt', callback);
}

export function write(service: POSSIBLE_SERVICES, data: string) {
	fs.writeFile(PATH + service + '.txt', data, function(err) {
		if (err) {
			return console.error(err);
		}
	});
}