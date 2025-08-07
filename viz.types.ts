import { z } from 'zod'
import { fa } from 'zod/v4/locales'

function null_array<T extends z.ZodTypeAny>(schema: T) {
  return z.array(schema).transform((val) => (val.length === 0 ? null : val))
}

const types = z.enum(['manga', 'book', 'novel', 'art book', 'activity book', 'film comic'])
const ages = z.enum(['All Ages', 'Teen', 'Teen Plus', 'Mature', 'Not Rated'])

const imprints = z.enum(['Haikasoru',
	'Shojo Beat',
	'SHONEN JUMP',
	'Shonen Sunday',
	'Studio Ghibli Library',
	'VIZ Media',
	'VIZ Originals',
	'VIZ Select',
	'VIZ Signature',
])

const distributor = z.object({
	name: imprints,
	link: z.string().url().nullish(),
	imprint: z.boolean().default(false),
})

const genre = z.object({
	genre: z.string(),
	link: z.string().url().nullish(),
})

const trim = z.object({
	w: z.number().nullish(),
	h: z.number().nullish(),
	unit: z.enum(['mm', 'inch']).default('mm'),
})

const price = z.object({
	value: z.number(),
	iso_code: z.string(), // ISO 4217
})

const staff = z.object({
	role: z.string(),
	name: z.string().nullish(),
	bio: z.string().nullish(),
})

const volume = z.object({
	url: z.string().url(),
	cover: z.string().url().nullish(),
	title: z.string().nullish(),
	staff: null_array(staff).nullish(),
	distributor: distributor.nullish(),
	genres: null_array(genre).nullish(),
	age_rating: ages.nullish(),
	edition: z.string().nullish(),
	description: z.string().nullish(),
	imprint: distributor.nullish(),
	isbn: z.string().nullish(),
	eisbn: z.string().nullish(),
	number: z.string().nullish(),
	release_date: z.coerce.date().nullish(),
	type: types.nullish(),
	price: price.nullish(),
	pages: z.number().nullish(),
	trim: trim.nullish().default(null),
	is_digital: z.boolean().default(false),
})

export const VizMangaBakaSeries = z.object({
	title: z.string(),
	url: z.string().url(),
	type: types.nullish(),
	volume_count: z.number().nullish(),
	cover: z.string().url().nullish(),
	staff: null_array(staff).nullish(),
	distributor: distributor.nullish(),
	imprint: distributor.nullish(),
	genres: null_array(genre).nullish(),
	age_rating: ages.nullish(),
	description: z.string().nullish(),
	volumes: null_array(volume).nullish(),
})

export type VizMangaBakaSeries = z.infer<typeof VizMangaBakaSeries>
