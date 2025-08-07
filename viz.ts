import { string_to_date } from './date.js'
//import { Logger } from '$lib/logger'
//import SeriesNews from '$lib/server/models/SeriesNews.model'
import { VizMangaBakaSeries } from './viz.types.js'
import axios, { all } from 'axios'
import * as cheerio from 'cheerio'
import { http_request } from './runner.js'
//import tracer, { type TraceOptions } from 'dd-trace'
//import { kinds } from 'dd-trace/ext'
//import tags from 'dd-trace/ext/tags'
import type { Job } from 'pg-boss'
import { de, it, ja, no, tr, ur } from 'zod/v4/locales'
import { AnyNode } from 'domhandler'
import { number, uuid } from 'zod/v4'
import { compileFunction } from 'vm'
import { DateTime } from 'luxon'
//import parser from 'xml2json'
//import SourceAnimeNewsNetwork from '../models/SourceAnimeNewsNetwork.model'
//import { Queue, QueueClient } from '../queue'

enum imprint_enum {
	'Haikasoru' = 'https://www.viz.com/haikasoru', // novels?
	'Shojo Beat' = 'https://www.viz.com/shojo-beat',
	'SHONEN JUMP' = 'https://www.viz.com/shonen-jump',
	'Shonen Sunday' = 'https://www.viz.com/shonen-sunday',
	'Studio Ghibli Library' = 'https://www.viz.com/studio-ghibli-library', // manga, art nook, activity book
	'VIZ Media' = 'https://www.viz.com/viz-media',
	'VIZ Originals' = 'https://www.viz.com/originals', // graphics novel
	'VIZ Select' = 'https://www.viz.com/viz-select',
	'VIZ Signature' = 'https://www.viz.com/viz-signature',
}

export async function all_series_page_parse(): Promise<Record<string, any>[]> {
	const all_series: Record<string, any>[] = []

	const $ = await http_request('https://www.viz.com/manga-books/manga-books/section/113671/more')

	const all_page = $('.p-cs-tile a')

	for (const item of all_page) {
		const title = item.attribs['rel']
		const series_url_text = item.attribs['href']

		all_series.push({'series_url': 'https://www.viz.com' + series_url_text, 'series_name': title})
		
	}
	
	return all_series
}

export async function parse_series_page(url: string): Promise<Record<string, any>> {
	if (!url) {
		throw new Error('Missing url')
	}
	const $ = await http_request(url)

	const content = $('section#series-intro')

	const series_details: Record<string, any> = {}
	series_details['staff'] = []
	series_details['volumes'] = []

	const title_raw = content.find('h2#page_title').text()
	const title_details = clean_series_title(title_raw)
	const title = title_details['series_title']

	const _creator = content.find('span.disp-bl--bm').text().replace('Created by ', '')
	const creator_split = _creator.split(' and ')
	const description = content.find('#series-intro-jump p').text().trim()
	const creator_blurb = content.find('#series-intro-jump .o_bio').text().trim()
	
	// Can have name1 and name2 and it's (nearly) always "Created by"
	// That makes it impossible to tell writer from artist. Wait on "book"
	if (creator_split.length === 1) {
		series_details['staff'].push({
			'name': creator_split[0],
			'role': 'writer',
			'bio': creator_blurb,
		})
		series_details['staff'].push({
			'name': creator_split[0],
			'role': 'artist',
			'bio': creator_blurb,
		})
	}

	// Imprint has .weight-bold QED
	const _genres = content.find('.mar-b-md--lg a')
	const genres = []
	let imprint = null
	for (const g of _genres) {
		const $g = $(g)
		const name: string = $g.text() || ''
		const link = 'https://www.viz.com' + $g.attr('href')
		if ($g.hasClass('weight-bold')) {
			imprint = {'name': name, 'link': imprint_enum[name as keyof typeof imprint_enum], 'imprint': true}
		} else {
			genres.push({'genre': name, 'link': link})
		}
	}
	
	// For fun, this page can also link to another page with all manga: 
	// https://www.viz.com/manga-books/jujutsu-kaisen/section/116980/more
	const has_more = $('div.section_see_all')?.first()?.children('a')

	if (has_more?.length == 1) {
		// Need to go to separate volumes page...
		const more_vol_url = has_more?.attr('href') || null
		if (more_vol_url === null) {
			console.log('Failed to find URL for addtional volumes page')
		} else {
			series_details['volumes'] = await parse_volume_page('https://viz.com' + more_vol_url)
		}
	} else {
		// All volumes on this page
		const _volume_latest = $('#section1 .manga_latest')
		const _volumes = $('#section1 .shelf article')

		for (const item of _volumes) {
			const $item = $(item)
			series_details['volumes'].push(parse_volume($item))
		}

		// Need special logic for latest
		const cover = _volume_latest.find('img')?.attr('data-original')
		const title = _volume_latest.find('.manga_latest h4').text().trim()
		const title_details = clean_series_title(title)
		const desc = _volume_latest.find('.manga_latest .text-spacing p').text().trim()
		const url = _volume_latest.find('.manga_latest .o_manga-buy-now')?.attr('href')
		// For fun, sometimes latest isn't the first volume...
		// If there is no number, presume we can ignore latest
		if (title_details['number']) {
			series_details['volumes'].push({
				'title': title_details['subtitle'] || null,
				'cover': cover || null,
				'number': title_details['number'] || null,
				'type': series_details['volumes']?.[0]?.['type'], // Can't get type from lastest
				'edition': title_details['edition'] || null,
				'url': 'https://www.viz.com' + url,
				'decription': desc,
			})
		}
	}

	series_details['title'] = title
	series_details['slug'] = url.replace('https://www.viz.com/', '').replace('/', '')
	series_details['url'] = url
	series_details['type'] = series_details['volumes']?.[0]?.['type']
	series_details['distributor'] = {'name': 'VIZ Media', 'link': 'https://viz.com'},
	series_details['imprint'] = imprint
	series_details['description'] = description
	
	series_details['genres'] = genres
	
	// Use volume 1 as cover for series
	series_details['cover'] = series_details['volumes']?.[0]?.['cover']
	series_details['volume_count'] = find_high_volume_number(series_details['volumes'])

	return VizMangaBakaSeries.parse(series_details)
}

function find_high_volume_number(volumes: Record<string, any>[]): number {
	let highest = 0
	for (const v of volumes) {
		const v_num = Number(v?.['number']) || 0
		if (v_num > highest) {
			highest = v_num
		}
	}
	return highest
}

function parse_volume($item: any): Record<string, any> {
	const cover = $item.find('img')?.attr('data-original')
	const type = $item.find('div.mar-b-sm')?.text()?.trim().toLowerCase()
	const title = $item.find('a').last().text().trim()
	const title_details = clean_series_title(title)
	const url = $item.find('a.product-thumb')?.attr('href')

	return {
		'title': title_details['subtitle'] || null,
		'cover': cover || null,
		'number': title_details['number'] || null,
		'type': type,
		'edition': title_details['edition'] || null,
		'url': 'https://viz.com' + url,
	}
}

export async function parse_volume_page(url: string | null): Promise<Record<string, any>[]> {
	if (url === null) {
		return []
	}
	const volumes: Record<string, any>[] = []
	const $ = await http_request(url)

	// Need to check there isn't another page with all the manga volumes
	const even_more = $('div.shelf-wrapper')

	if (even_more.length == 0) {
		for (const item of $('div.shelf article')) {
			const $item = $(item)
			volumes.push(parse_volume($item))
		}
	} else {
		// Need to fetch only those sections without an additional page as otherwise there will be duplicates
		for (const section of even_more) {
			const $section = $(section)
			// Does this section have ANOTHER page with ALL items?
			const next_link = $section.find('div.shelf-wrapper .float-r--lg a')?.attr('href')
			if (next_link) {
				volumes.push(...await parse_volume_page('https://viz.com' + next_link))
			} else {
				// All we need is in this section
				for (const item of $section.find('div.shelf article')) {
					const $item = $(item)
					volumes.push(parse_volume($item))
				}
			}
		}
	}
	
	return volumes
}

export async function parse_book_page(url_in: string): Promise<Record<string, any>> {
	// The initial URL should NOT be a digital one i.e "/digital"
	if (!url_in) {
		throw new Error('Missing slug')
	}
	let url = url_in
	// Just in case we are thrown a "paperback" URL
	if (url.endsWith('paperback')) {
		url = url.replace('/paperback', '')
	}

	const $ = await http_request(url)
	const is_digital = url.endsWith('digital')
	const series: Record<string, any> = {}
	const book: Record<string, any> = {}
	book['genres'] = []
	const books: Record<string, any>[] = []
	
	const top_content = $('#product_detail')
	const bottom_content = $('#product_detail').next()
	const has_digital = top_content.find('a#buy_digital_tab').length > 0 ? true : false

	const cover = top_content.find('#product_image_block img')?.attr('src')
	const _genres = top_content.find('.float-l a')
	for (const g of _genres) {
		const $g = $(g)
		const name: string = $g.text() || ''
		const link = 'https://www.viz.com' + $g.attr('href')
		if ($g.hasClass('weight-bold')) {
			book['imprint'] = {'name': name, 'link': imprint_enum[name as keyof typeof imprint_enum], 'imprint': true}
		} else {
			book['genres'].push({'genre': name, 'link': link})
		}
	}

	const series_title = top_content.find('h2').text().trim()
	const series_title_details = clean_series_title(series_title)
	const desc = bottom_content.find('.text-spacing p')?.text().trim()

	const _authors = bottom_content.find('.mar-b-md')?.first()?.text().trim()
	const authors_split = _authors.split(',')
	const staff: Record<string, any>[] = []
	for (const a of authors_split) {
		const a_split = a.split(' by ')
		switch (a_split?.[0]?.trim()?.toLowerCase()) {
		case 'story and art':
			staff.push({'name': a_split[1], 'role': 'writer'})
			staff.push({'name': a_split[1], 'role': 'artist'})
			break
		case 'story':
		case 'written':
			staff.push({'name': a_split[1], 'role': 'writer'})
			break
		case 'art':
			staff.push({'name': a_split[1], 'role': 'artist'})
			break
		case'original concept':
			staff.push({'name': a_split[1], 'role': 'original concept'})
			break
		}
	}

	// I have no idea why sometimes it adds a double space "July  5, 2016" https://www.viz.com/manga-books/manga/7thgarden-volume-1/product/4822
	const _release = bottom_content.find('.o_release-date')?.text()?.replace('Release ', '')?.trim().replaceAll('  ', ' ')
	try {
		book['release_date'] = string_to_date(_release).toJSDate()
	} catch {
		book['release_date'] = null
	}
	const isbn = bottom_content.find('.o_isbn13')?.text()?.replace('ISBN-13', '').trim() || null
	const eisbn = bottom_content.find('.o_eisbn13')?.text()?.replace('eISBN-13', '').trim() || null
	const _trim = bottom_content.find('.o_trimsize')?.text().replace('Trim Size', '').trim() || null
	const trim: Record<string, number> = {}
	const trim_split = _trim?.split(' × ') || [] // not a normal ASCII "x"
	if (trim_split.length > 1) {
		// Can contain fractions 1/2 etc.
		const fraction_regex = new RegExp(/(\d+)\s(\d\/\d)/)
		const fraction_w = fraction_regex.exec(trim_split[0])
		if (fraction_w === null) {
			trim['w'] = Number(trim_split[0]) * 25.4
		} else {
			const fraction_w_split = fraction_w[2].split('/')
			const fraction_dec = Number(fraction_w_split?.[0]) * Number(fraction_w_split?.[1]) || 0
			trim['w'] = (Number(fraction_w[1]) + fraction_dec) * 25.4
		}
		const fraction_h = fraction_regex.exec(trim_split[1])
		if (fraction_h === null) {
			trim['h'] = Number(trim_split[0]) * 25.4
		} else {
			const fraction_h_split = fraction_h[2].split('/')
			const fraction_dec = Number(fraction_h_split?.[0]) / Number(fraction_h_split?.[1]) || 0
			trim['h'] = (Number(fraction_h[1]) + fraction_dec) * 25.4
		}
	}

	// Second info coloum doesn't have usefully named classes
	const sec_coloum = bottom_content.find('.g-6--md.g-omega--md').children().map(function(i, ele) {
		return $(ele).text().replace(/\n/g, '').replaceAll(/\s{2,}/g, ' ').trim()
	}).toArray()
	for (const thing of sec_coloum) {
		switch (true) {
			case thing.startsWith('Length'):
				book['pages'] = Number(/\d+/.exec(thing)?.[0]) || null
				break
			case thing.startsWith('Category'):
				book['type'] = thing.replace('Category', '').trim().toLowerCase()
				break
			case thing.startsWith('Age'):
				book['age_rating'] = thing.replace('Age Rating', '').trim()
		}
	}

	const edition = series_title_details['edition'] || null
	const _series_url = bottom_content.find('.g-6--md.g-omega--md a')?.first()?.attr('href')
	const series_url = 'https://www.viz.com' + _series_url

	book['title'] = series_title_details['subtitle']
	book['cover'] = cover
	book['number'] = series_title_details['number']
	book['url'] = url
	book['staff'] = staff
	book['distributor'] = {'name': 'VIZ Media', 'link': 'https://www.viz.com'}
	book['edition'] = edition
	book['description'] = desc
	book['isbn'] = isbn || null
	book['eisbn'] = eisbn || null
	book['trim'] = Object.keys(trim).length === 0 ? null : trim
	book['is_digital'] = is_digital
	
	books.push(book)

	series['title'] = series_title_details['series_title']
	series['url'] = series_url
	series['volumes'] = books

	if (has_digital && !is_digital) {
		// Grab digital details
		const digital = await parse_book_page(url + '/digital')
		books.push(digital['volumes'][0])
	}

	return VizMangaBakaSeries.parse(series)
}

function clean_series_title(series_title: string): Record<string, any> {
	const series_title_main = /^(?<title>.*?)(?:[:-]\s(?<subtitle>\w.*?))?(?:,\s(?:vol.|chapter)\s(?<num>\d+.\d+|\d+))?$/i.exec(series_title)
	let series_title_clean: string = series_title
	let subtitle: string = ''
	let num: string = ''
	let edition: string = ''
	if (series_title_main && series_title_main.groups) {
		// Find edition separately because regex would be too cursed
		// Box Set, Box Set 1, (All-in-One Edition), Black Edition, Complete Box Set, 3-in-1 Edition
		const ed_match = /.*?(?<box>complete box set\s*\d*|box set\s*\d*)|(?<all>\(*all-in-one\s*\w*\)*)|(?<black>black edition)|(?<three>\d-in-1)/i.exec(series_title_main.groups.title)
		let ed_text = ''
		if (ed_match && ed_match.groups) {
			if (ed_match.groups.box) {
				edition = 'Box Set'
				ed_text = ed_match.groups.box
				// Let's check for box set number
				const ed_number = /\d+/.exec(ed_text)?.[0]
				if (ed_number) {
					num = ed_number
				}
			}
			if (ed_match.groups.all) {
				edition = 'All-in-One'
				ed_text = ed_match.groups.all
			}
			if (ed_match.groups.black) {
				edition = 'Black Edition'
				ed_text =ed_match.groups.black
			}
			if (ed_match.groups.three) {
				edition = '3-in-1'
				ed_text =ed_match.groups.three
			}
		}
		series_title_clean = series_title_main.groups.title
		series_title_clean = series_title_clean.replace(ed_text, '')
		// If the edition text was removed, may be () leftover
		series_title_clean = series_title_clean.replace('()', '')
		series_title_clean = series_title_clean.trim()
		if (series_title_main.groups.subtitle) {
			subtitle = series_title_main.groups.subtitle
			subtitle = subtitle.replace(ed_text, '')
		}
		if (series_title_main.groups.num) {
			num = series_title_main.groups.num
		}
	}
	return {'series_title': series_title_clean, 'subtitle': subtitle, 'number': num, 'edition': edition}
}

/*export function worker_produce(worker: QueueClient) {
	//const log = Logger.label('ann_news_schedule_refresh')

	const options: TraceOptions & tracer.SpanOptions = {
		tags: {
			[tags.MANUAL_KEEP]: true,
			[tags.SPAN_KIND]: kinds.PRODUCER,
			[tags.SPAN_TYPE]: 'worker',
		},
	}

	return tracer.wrap('ann_news_schedule_refresh', options, async () => {
		const rows = await SourceAnimeNewsNetwork.scope('due_for_update').findAll()
		if (rows.length == 0) {
			log.debug('No AnimeNewsNetwork entries due for news refresh')

			return
		}

		for (const row of rows) {
			log.info('AnimeNewsNetwork', row.id, 'will be scheduled for news refresh')

			await update_last_scheduled_at(row)
			await worker.send(Queue.news_ann_work, { id: row.id })
		}
	})
}

export async function worker_consume_batch(jobs: RefreshSeriesNewsPayload) {
	const log = Logger.label('ann_refresh_news_batch')
	log.info('Processing', jobs.length, 'jobs concurrently')

	await Promise.allSettled(
		jobs.map(async (job) => {
			try {
				await worker_consume([job])
				await QueueClient.Worker.boss.complete(Queue.news_ann_work.name, job.id)
			} catch (err) {
				await QueueClient.Worker.boss.fail(Queue.news_ann_work.name, job.id, err as object)
			}
		}),
	)

	log.info('Done processing', jobs.length, 'jobs concurrently')
}

export async function worker_consume([job]: RefreshSeriesNewsPayload) {
	const log = Logger.label(`ann_refresh_news`)

	const options: TraceOptions & tracer.SpanOptions = {
		tags: {
			[tags.MANUAL_KEEP]: true,
			[tags.SPAN_KIND]: kinds.CONSUMER,
			[tags.SPAN_TYPE]: 'worker',
			series: job.data,
		},
	}

	await tracer.trace('ann_refresh_news', options, async () => {
		// ! Don't wrap in a big transaction, it can be incredible slow and failing one entry
		// ! would undo all of them

		const row = await SourceAnimeNewsNetwork.findByPk(job.data.id)
		if (!row) {
			log.warn('could not find AnimeNewsNetwork row with ID', job.data.id)
			return
		}

		log.info('Updating AnimeNewsNetwork entry [', row.id, ']')

		await refresh_news(row)
	})
}

function update_last_scheduled_at(row: SourceAnimeNewsNetwork) {
	row.last_scheduled_at = new Date()
	return row.save()
}

export async function worker_consume_discover_new_entries() {
	const log = Logger.label(`worker_consume_discover_new_entries`)

	const resp = await axios.get(`https://www.animenewsnetwork.com/encyclopedia/reports.xml?id=149`)
	const result = parser.toJson(resp.data, { object: true, coerce: true })
	const report = result.report as { item: any[] }

	for (const item of report.item as any[]) {
		const id = item.manga.href.split('?id=')[1]
		if (!id) {
			log.warn('Could not find ID for encyclopedia entry')
			continue
		}

		const [, created] = await SourceAnimeNewsNetwork.findOrCreate({
			where: { id },
		})

		if (created) {
			log.info('Discovered new ANN encyclopedia entry', id)
		}
	}
}
*/