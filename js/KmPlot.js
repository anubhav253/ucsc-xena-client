'use strict';

import kmStyle from "./km.module.css";
var _ = require('./underscore_ext');
import PureComponent from './PureComponent';
var React = require('react');
import {Button} from 'react-toolbox/lib/button';

import Dialog from 'react-toolbox/lib/dialog';

var Axis = require('./Axis');
var {linear, linearTicks} = require('./scale');
var pdf = require('./kmpdf');
var NumberForm = require('./views/NumberForm');

// Basic sizes. Should make these responsive. How to make the svg responsive?
var margin = {top: 20, right: 30, bottom: 30, left: 50};

// XXX point at 100%? [xdomain[0] - 1, 1]
function line(xScale, yScale, values) {
	var coords = values.map(({t, s}) => [xScale(t), yScale(s)]);
	return ['M0,0', ...coords.map(([t, s]) => `H${t}V${s}`)].join(' ');
}

function censorLines(xScale, yScale, censors, className) {
	return censors.map(({t, s}, i) =>
		<line
			key={i}
			className={className}
			x1={0} x2={0} y1={-5} y2={5}
			transform={`translate(${xScale(t)},${yScale(s)})`} />
	);
}

function calcDims (viewDims, sizeRatios) {
	return _.mapObject(sizeRatios, (section) => {
		return _.mapObject(section, (ratio, side) => viewDims[side] * ratio);
	});
}

function checkIfActive(currentLabel, activeLabel) {
	// check whether this line group should be set to Active
	return !!activeLabel && (activeLabel === currentLabel);
}

class LineGroup extends React.Component {
	shouldComponentUpdate(newProps) {
		return !_.isEqual(_.omit(newProps, 'xScale', 'yScale'), _.omit(this.props, 'xScale', 'yScale'));
	}

	render() {
		let {xScale, yScale, g, setActiveLabel, isActive} = this.props;
		let [color, label, curve] = g;
		var censors = curve.filter(pt => !pt.e);

		let outlineStyle = isActive ? kmStyle.outlineHover : kmStyle.outline;
		let lineStyle = isActive ? kmStyle.lineHover : kmStyle.line;

		return (
			<g key={label} className={kmStyle.subgroup} stroke={color}
			   	onMouseOver={(e) => setActiveLabel(e, label)}
			   	onMouseOut={(e) => setActiveLabel(e, '')}>
				<path className={outlineStyle} d={line(xScale, yScale, curve)}/>
				<path className={lineStyle} d={line(xScale, yScale, curve)}/>
				{censorLines(xScale, yScale, censors, outlineStyle)}
				{censorLines(xScale, yScale, censors, lineStyle)}
			</g>
		);
	}
}

var bounds = x => [_.min(x), _.max(x)];

function svg({colors, labels, curves}, setActiveLabel, activeLabel, size) {
	var height = size.height - margin.top - margin.bottom,
		width = size.width - margin.left - margin.right,
		xdomain = bounds(_.pluck(_.flatten(curves), 't')),
		xrange = [0, width],
		ydomain = [0, 1],
		yrange = [height, 0],
		xScale = linear(xdomain, xrange),
		yScale = linear(ydomain, yrange);

	var groupSvg = _.zip(colors, labels, curves).map((g, index) => {
		let [, label] = g;
		// passing bounds to force update when scales change
		return (<LineGroup
				key={index}
				bounds={[xdomain, xrange, ydomain, yrange]}
				xScale={xScale}
				yScale={yScale}
				g={g}
				isActive={label === activeLabel}
				setActiveLabel={setActiveLabel}/>);
	});

	return (
		<svg width={size.width} height={size.height}>
			<g transform={`translate(${margin.left}, ${margin.top})`}>
				<Axis
					groupProps={{
						className: `x ${kmStyle.axis}`,
						transform: `translate(0, ${height})`
					}}
					domain={xdomain}
					range={xrange}
					scale={xScale}
					tickfn={linearTicks}
					orientation='bottom'
				/>
				<Axis
					groupProps={{
						className: `y ${kmStyle.axis}`
					}}
					domain={ydomain}
					range={yrange}
					scale={yScale}
					tickfn={linearTicks}
					orientation='left'>

					<text
						transform='rotate(-90)'
						y='5'
						x={-height + 5}
						dy='.71em'
						textAnchor='start'>
						Survival probability
					</text>
				</Axis>
				{groupSvg}
			</g>
		</svg>
	);
}

var formatPValue = v => v == null ? String.fromCharCode(8709) : v.toPrecision(4);

class WarningTrigger extends React.Component {
	state = { show: false };

	close = () => {
		this.setState({show: false}).bind(this);
	};

	render() {
		let {header, body} = this.props;

		return (
			<div className={kmStyle.warningContainer}>
				<Button
					onClick={() => this.setState({show: true})}
					className={kmStyle.showPWarningButton}
				>
					<span className={`glyphicon glyphicon-warning-sign ${kmStyle.pWarningIcon}`}/>
				</Button>
				{this.state.show ? <WarningDialog onHide={this.close} header={header} body={body}/> : null}
			</div>
		);
	}
}

class WarningDialog extends React.Component {
	componentDidMount() {
		var body = document.getElementById("body");
		body.style.overflow = "auto";
	}

	render() {

		const actions = [
			{
				label: <i className='material-icons'>close</i>,
				className: kmStyle.warningDialogClose,
				onClick: this.props.onHide
			},
		];

		return (
			<Dialog
				actions={actions}
				active={true}
				title={this.props.header}
				className={kmStyle.warningDialog}
				onEscKeyDown={this.props.onHide}
				onOverlayClick={this.props.onHide}
				theme={{
					wrapper: kmStyle.dialogWrapper,
					overlay: kmStyle.dialogOverlay}}>
				{this.props.body}
			</Dialog>
		);
	}
}


class PValue extends PureComponent {
	render() {
		var {logRank, pValue, patientWarning} = this.props;
		return (
			<div>
				<div className={kmStyle.PValueArea}>
					<div className={kmStyle.PValueP}><i>P</i>-value = {formatPValue(pValue)}</div>
					{patientWarning ?
						<WarningTrigger
							header="P value warning"
							body={patientWarning}
						/> : null}
				</div>
				<div>
					<span>Log-rank test statistics = {formatPValue(logRank)}</span>
				</div>
			</div>
		);
	}
}

// Sample count is 'n' at 1st time point.
function sampleCount(curve) {
	return _.getIn(curve, [0, 'n'], String.fromCharCode(8709));
}

function makeLegendKey([color, curves, label], setActiveLabel, activeLabel) {
	// show colored line and category of curve
	let isActive = checkIfActive(label, activeLabel);
	let labelClassName = isActive ? kmStyle.activeListItem : kmStyle.listItem;
	let legendLineStyle = {
		backgroundColor: color,
		border: (isActive ? 2 : 1).toString() + 'px solid',
		display: 'inline-block',
		height: 6,
		width: 25,
		verticalAlign: 'middle'
	};

	return (
		<li
			key={label}
			className={labelClassName}
			onMouseOver={(e) => setActiveLabel(e, label)}
			onMouseOut={(e) => setActiveLabel(e, '')}>
			<span style={legendLineStyle}/> {label} (n={sampleCount(curves)})
		</li>

	);
}

class Legend extends PureComponent {
	render() {
		let { groups, setActiveLabel, activeLabel } = this.props;
		let {colors, curves, labels} = groups;
		let sets = _.zip(colors, curves, labels)
				.map(set => makeLegendKey(set, setActiveLabel, activeLabel));

		return (
			<div className={kmStyle.legend}>{sets}</div>
		);
	}
}

function makeGraph(groups, setActiveLabel, activeLabel, size) {
	return (
		<div className={kmStyle.graph} style={{width: 0.9 * size.width}}>
			{svg(groups, setActiveLabel, activeLabel, {height: 0.8 * size.height, width: 0.9 * size.width})}
			<div className={kmStyle.screen}/>
		</div>
	);
}

function makeSplits(splits, onSplits) {
	return (
		<form>
			<div>
				<label className={kmStyle.splitLabel}>
					<input value={2} type="radio" name="splits" checked={splits === 2} onChange={onSplits}/>
					<span className={kmStyle.splitHint}>2 groups</span>
				</label>
				<label className={kmStyle.splitLabel}>
					<input value={3} type="radio" name="splits" checked={splits === 3} onChange={onSplits}/>
					<span className={kmStyle.splitHint}>3 groups</span>
				</label>
			</div>
		</form>);
}

function makeDefinitions(groups, setActiveLabel, activeLabel, size, maySplit, splits, onSplits) {
	// get new size based on size ratio for definitions column

	return (
		<div className={kmStyle.definitions} style={{width: size.width}}>
			<PValue pValue={groups.pValue} logRank={groups.KM_stats}
				patientWarning={groups.patientWarning}/>
			<br/>
			{maySplit ? makeSplits(splits, onSplits) : null}
			<br/>
			<Legend groups={groups}
					setActiveLabel={setActiveLabel}
					activeLabel={activeLabel}/>
		</div>
	);
}

var plotSize = {
	ratios: {
		graph: {
			width: 0.75,
			height: 1.0
		},
		definitions: {
			width: 0.4,
			height: 1.0
		}
	}
};

class KmPlot extends PureComponent {
	static defaultProps = {
		eventClose: 'km-close',
		dims: {
			height: 450,
			width: 700
		}
	};

	state = { activeLabel: '' };

	hide = () => {
		let {callback, eventClose} = this.props;
		callback([eventClose]);
	};

	// cutoff needs to rewrite the group calc, but we need
	// the full range in order to range-check the bound. So
	// the compute should stash the domain.
	onCutoff = (v) => {
		let {callback} = this.props;
		callback(['km-cutoff', v]);
	};

	setActiveLabel = (e, label) => {
		this.setState({ activeLabel: label });
	};

	pdf = () => {
		pdf(this.props.km.groups);
	};

	help = () => {
		window.location.href = "http://xena.ucsc.edu/km-plot-help/";
	};

	onSplits = (ev) => {
		var {callback} = this.props;
		callback(['km-splits', parseInt(ev.target.value, 10)]);
	};

	componentDidMount() {
		var body = document.getElementById("body");
		body.style.overflow = "auto";
	}

	render() {
		let {km: {splits = 2, title, label, groups, cutoff}, dims} = this.props,
			// groups may be undefined if data hasn't loaded yet.
			maySplit = _.get(groups, 'maySplit', false),
			min = _.getIn(groups, ['domain', 0]),
			max = _.getIn(groups, ['domain', 1]),
			warning = _.get(groups, 'warning'),
			fullLabel = warning ? `${label} (${warning})` : label,
			{activeLabel} = this.state,
			sectionDims = calcDims(dims, plotSize.ratios);

		let Content = _.isEmpty(groups)
			? <div
				style={{
					height: dims.height,
					textAlign: 'center',
					verticalAlign: 'center'
				}}>
				<h1>Loading...</h1>
			</div>
			: (_.isEmpty(groups.colors)
					? <div><h3>Unfortunately, KM plot can not be made. There is no survival data overlapping column
						data.</h3></div>
					: <div>
						<Button onClick={this.pdf} className={kmStyle.PDFButton}>
							<span className={`glyphicon glyphicon-download ${kmStyle.buttonIcon}`}/>
							PDF
						</Button>
						<Button onClick={this.help} className={kmStyle.helpButton}>
							<span className={`glyphicon glyphicon-question-sign ${kmStyle.buttonIcon}`}/>
							Help
						</Button>
						{makeGraph(groups, this.setActiveLabel, activeLabel, sectionDims.graph)}
						{makeDefinitions(groups, this.setActiveLabel, activeLabel, sectionDims.definitions, maySplit, splits, this.onSplits)}
						<div style={{clear: 'both'}}>
							<NumberForm
								onChange={this.onCutoff}
								dflt={max}
								min={min}
								max={max}
								initialValue={cutoff}/>
						</div>
						<samp className={kmStyle.featureLabel}>{fullLabel}</samp>
					</div>
			);

		const actions = [
			{
				label: <i className='material-icons'>close</i>,
				className: kmStyle.mainDialogClose,
				onClick: this.hide
			},
		];
		return (
			<div>
				<Dialog
					actions={actions}
					active={true}
					title={'Kaplan Meier' + title}
					className={kmStyle.mainDialog}
					onEscKeyDown={this.hide}
					onOverlayClick={this.hide}
					theme={{
						wrapper: kmStyle.dialogWrapper,
						overlay: kmStyle.dialogOverlay}}>
					{Content}
				</Dialog>
			</div>
		);
	}
}

module.exports = {KmPlot};
