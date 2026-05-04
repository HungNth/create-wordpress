import chalk from 'chalk';
import { runWpCommand } from './wpcli.js';

/**
 * Builds the WP-CLI args for a single tweak entry.
 * Returns null if the entry type is unrecognised.
 */
function tweakToArgs(tweak) {
	switch (tweak.type) {
		case 'config_set': {
			const args = ['config', 'set', tweak.key, tweak.value];
			if (tweak.raw) args.push('--raw');
			return args;
		}
		case 'rewrite_structure':
			return ['rewrite', 'structure', tweak.value, '--hard'];
		case 'option_update':
			return ['option', 'update', tweak.key, tweak.value];
		case 'language_core':
			return ['language', 'core', tweak.key, tweak.value];
		case 'site':
			return ['site', tweak.key, tweak.value];
		default:
			return null;
	}
}

/** Describes a tweak in a compact, human-readable form. */
function describeTweak(tweak) {
	switch (tweak.type) {
		case 'config_set': return `config set ${tweak.key} = ${tweak.value}${tweak.raw ? ' (raw)' : ''}`;
		case 'rewrite_structure': return `rewrite structure ${tweak.value}`;
		case 'option_update': return `option update ${tweak.key} = ${tweak.value}`;
		case 'language_core': return `language core ${tweak.key} ${tweak.value}`;
		case 'site': return `site ${tweak.key} ${tweak.value}`;
		default: return JSON.stringify(tweak);
	}
}

export async function applyWpTweaks(siteName, siteDir, config) {
	const tweaks = config.wp_tweaks || [];
	if (!tweaks.length) {
		console.log(chalk.yellow('⚠  No wp_tweaks defined in config.json.\n'));
		return;
	}

	console.log(chalk.bold.cyan(`\n⚙️   Applying ${tweaks.length} WordPress tweaks to "${siteName}"\n`));

	let ok = 0;
	let fail = 0;

	for (const tweak of tweaks) {
		const args = tweakToArgs(tweak);
		if (!args) {
			console.log(chalk.gray(`  ⊘  Unknown type "${tweak.type}" — skipped`));
			continue;
		}

		const label = describeTweak(tweak);
		try {
			runWpCommand(args, siteDir);
			console.log(`  ${chalk.green('✔')}  ${chalk.gray(label)}`);
			ok++;
		} catch (err) {
			console.log(`  ${chalk.red('✖')}  ${chalk.gray(label)}`);
			console.log(chalk.red(`       ${err.message}`));
			fail++;
		}
	}

	console.log();
	if (fail === 0) {
		console.log(chalk.green(`✔  All ${ok} tweaks applied successfully.\n`));
	} else {
		console.log(chalk.yellow(`⚠  ${ok} succeeded, ${fail} failed.\n`));
	}
}
