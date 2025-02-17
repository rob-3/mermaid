import { curveBasis, line, select } from 'd3';

import db from './gitGraphAst';
import gitGraphParser from './parser/gitGraph';
import { log } from '../../logger';
import { interpolateToCurve } from '../../utils';
import { getConfig } from '../../config';

let allCommitsDict = {};
let branchNum;
let config = {
  nodeSpacing: 150,
  nodeFillColor: 'yellow',
  nodeStrokeWidth: 2,
  nodeStrokeColor: 'grey',
  lineStrokeWidth: 4,
  branchOffset: 50,
  lineColor: 'grey',
  leftMargin: 50,
  branchColors: ['#442f74', '#983351', '#609732', '#AA9A39'],
  nodeRadius: 10,
  nodeLabel: {
    width: 75,
    height: 100,
    x: -25,
    y: 0,
  },
};
let apiConfig = {};
export const setConf = function (c) {
  apiConfig = c;
};

/** @param svg */
function svgCreateDefs(svg) {
  svg
    .append('defs')
    .append('g')
    .attr('id', 'def-commit')
    .append('circle')
    .attr('r', config.nodeRadius)
    .attr('cx', 0)
    .attr('cy', 0);
  svg
    .select('#def-commit')
    .append('foreignObject')
    .attr('width', config.nodeLabel.width)
    .attr('height', config.nodeLabel.height)
    .attr('x', config.nodeLabel.x)
    .attr('y', config.nodeLabel.y)
    .attr('class', 'node-label')
    .attr('requiredFeatures', 'http://www.w3.org/TR/SVG11/feature#Extensibility')
    .append('p')
    .html('');
}

/**
 * @param svg
 * @param points
 * @param colorIdx
 * @param interpolate
 */
function svgDrawLine(svg, points, colorIdx, interpolate) {
  const curve = interpolateToCurve(interpolate, curveBasis);
  const color = config.branchColors[colorIdx % config.branchColors.length];
  const lineGen = line()
    .x(function (d) {
      return Math.round(d.x);
    })
    .y(function (d) {
      return Math.round(d.y);
    })
    .curve(curve);

  svg
    .append('svg:path')
    .attr('d', lineGen(points))
    .style('stroke', color)
    .style('stroke-width', config.lineStrokeWidth)
    .style('fill', 'none');
}

/**
 * Pass in the element and its pre-transform coords
 *
 * @param element
 * @param coords
 */
function getElementCoords(element, coords) {
  coords = coords || element.node().getBBox();
  const ctm = element.node().getCTM();
  const xn = ctm.e + coords.x * ctm.a;
  const yn = ctm.f + coords.y * ctm.d;
  return {
    left: xn,
    top: yn,
    width: coords.width,
    height: coords.height,
  };
}

/**
 * @param svg
 * @param fromId
 * @param toId
 * @param direction
 * @param color
 */
function svgDrawLineForCommits(svg, fromId, toId, direction, color) {
  log.debug('svgDrawLineForCommits: ', fromId, toId);
  const fromBbox = getElementCoords(svg.select('#node-' + fromId + ' circle'));
  const toBbox = getElementCoords(svg.select('#node-' + toId + ' circle'));
  switch (direction) {
    case 'LR':
      // (toBbox)
      //  +--------
      //          + (fromBbox)
      if (fromBbox.left - toBbox.left > config.nodeSpacing) {
        const lineStart = {
          x: fromBbox.left - config.nodeSpacing,
          y: toBbox.top + toBbox.height / 2,
        };
        const lineEnd = { x: toBbox.left + toBbox.width, y: toBbox.top + toBbox.height / 2 };
        svgDrawLine(svg, [lineStart, lineEnd], color, 'linear');
        svgDrawLine(
          svg,
          [
            { x: fromBbox.left, y: fromBbox.top + fromBbox.height / 2 },
            { x: fromBbox.left - config.nodeSpacing / 2, y: fromBbox.top + fromBbox.height / 2 },
            { x: fromBbox.left - config.nodeSpacing / 2, y: lineStart.y },
            lineStart,
          ],
          color
        );
      } else {
        svgDrawLine(
          svg,
          [
            {
              x: fromBbox.left,
              y: fromBbox.top + fromBbox.height / 2,
            },
            {
              x: fromBbox.left - config.nodeSpacing / 2,
              y: fromBbox.top + fromBbox.height / 2,
            },
            {
              x: fromBbox.left - config.nodeSpacing / 2,
              y: toBbox.top + toBbox.height / 2,
            },
            {
              x: toBbox.left + toBbox.width,
              y: toBbox.top + toBbox.height / 2,
            },
          ],
          color
        );
      }
      break;
    case 'BT':
      //      +           (fromBbox)
      //      |
      //      |
      //              +   (toBbox)
      if (toBbox.top - fromBbox.top > config.nodeSpacing) {
        const lineStart = {
          x: toBbox.left + toBbox.width / 2,
          y: fromBbox.top + fromBbox.height + config.nodeSpacing,
        };
        const lineEnd = { x: toBbox.left + toBbox.width / 2, y: toBbox.top };
        svgDrawLine(svg, [lineStart, lineEnd], color, 'linear');
        svgDrawLine(
          svg,
          [
            { x: fromBbox.left + fromBbox.width / 2, y: fromBbox.top + fromBbox.height },
            {
              x: fromBbox.left + fromBbox.width / 2,
              y: fromBbox.top + fromBbox.height + config.nodeSpacing / 2,
            },
            { x: toBbox.left + toBbox.width / 2, y: lineStart.y - config.nodeSpacing / 2 },
            lineStart,
          ],
          color
        );
      } else {
        svgDrawLine(
          svg,
          [
            {
              x: fromBbox.left + fromBbox.width / 2,
              y: fromBbox.top + fromBbox.height,
            },
            {
              x: fromBbox.left + fromBbox.width / 2,
              y: fromBbox.top + config.nodeSpacing / 2,
            },
            {
              x: toBbox.left + toBbox.width / 2,
              y: toBbox.top - config.nodeSpacing / 2,
            },
            {
              x: toBbox.left + toBbox.width / 2,
              y: toBbox.top,
            },
          ],
          color
        );
      }
      break;
  }
}

/**
 * @param svg
 * @param selector
 */
function cloneNode(svg, selector) {
  return svg.select(selector).node().cloneNode(true);
}

/**
 * @param svg
 * @param commitid
 * @param branches
 * @param direction
 */
function renderCommitHistory(svg, commitid, branches, direction) {
  let commit;
  const numCommits = Object.keys(allCommitsDict).length;
  if (typeof commitid === 'string') {
    let cnt = 0;
    do {
      cnt++;
      commit = allCommitsDict[commitid];
      log.debug('in renderCommitHistory', commit.id, commit.seq);
      if (svg.select('#node-' + commitid).size() > 0) {
        return;
      }
      svg
        .append(function () {
          return cloneNode(svg, '#def-commit');
        })
        .attr('class', 'commit')
        .attr('id', function () {
          return 'node-' + commit.id;
        })
        .attr('transform', function () {
          switch (direction) {
            case 'LR':
              return (
                'translate(' +
                (commit.seq * config.nodeSpacing + config.leftMargin) +
                ', ' +
                branchNum * config.branchOffset +
                ')'
              );
            case 'BT':
              return (
                'translate(' +
                (branchNum * config.branchOffset + config.leftMargin) +
                ', ' +
                (numCommits - commit.seq) * config.nodeSpacing +
                ')'
              );
          }
        })
        .attr('fill', config.nodeFillColor)
        .attr('stroke', config.nodeStrokeColor)
        .attr('stroke-width', config.nodeStrokeWidth);

      let branch_names = [];
      for (let branchName in branches) {
        if (branches[branchName].commit === commit) {
          branch_names.push(branches[branchName]);
        }
      }
      if (branch_names.length !== 0) {
        for (const branch of branch_names) {
          log.debug('found branch ', branch.name);
          svg
            .select('#node-' + commit.id + ' p')
            .append('xhtml:span')
            .attr('class', 'branch-label')
            .text(branch.name + ', ');
        }
      }
      svg
        .select('#node-' + commit.id + ' p')
        .append('xhtml:span')
        .attr('class', 'commit-id')
        .text(commit.message || commit.id);
      if (commit.message !== '' && direction === 'BT') {
        svg
          .select('#node-' + commit.id + ' p')
          .append('xhtml:span')
          .attr('class', 'commit-msg')
          .text(', ' + commit.message);
      }
      commitid = commit.parent;
    } while (commitid && allCommitsDict[commitid] && cnt < 1000);
  }

  if (Array.isArray(commitid)) {
    log.debug('found merge commmit', commitid);
    renderCommitHistory(svg, commitid[0], branches, direction);
    branchNum++;
    renderCommitHistory(svg, commitid[1], branches, direction);
    branchNum--;
  }
}

/**
 * @param svg
 * @param commit
 * @param direction
 * @param branchColor
 */
function renderLines(svg, commit, direction, branchColor) {
  branchColor = branchColor || 0;
  let cnt = 0;
  while (commit.seq > 0 && !commit.lineDrawn && cnt < 1000) {
    cnt++;
    if (typeof commit.parent === 'string') {
      svgDrawLineForCommits(svg, commit.id, commit.parent, direction, branchColor);
      commit.lineDrawn = true;
      commit = allCommitsDict[commit.parent];
    } else if (Array.isArray(commit.parent)) {
      svgDrawLineForCommits(svg, commit.id, commit.parent[0], direction, branchColor);
      svgDrawLineForCommits(svg, commit.id, commit.parent[1], direction, branchColor + 1);
      renderLines(svg, allCommitsDict[commit.parent[1]], direction, branchColor + 1);
      commit.lineDrawn = true;
      commit = allCommitsDict[commit.parent[0]];
    }
  }
}

export const draw = function (txt, id, ver) {
  try {
    const parser = gitGraphParser.parser;
    parser.yy = db;
    parser.yy.clear();

    const securityLevel = getConfig().securityLevel;
    // Handle root and ocument for when rendering in sanbox mode
    let sandboxElement;
    if (securityLevel === 'sandbox') {
      sandboxElement = select('#i' + id);
    }
    const root =
      securityLevel === 'sandbox'
        ? select(sandboxElement.nodes()[0].contentDocument.body)
        : select('body');
    const doc = securityLevel === 'sandbox' ? sandboxElement.nodes()[0].contentDocument : document;

    log.debug('in gitgraph renderer', txt + '\n', 'id:', id, ver);
    // Parse the graph definition
    parser.parse(txt + '\n');

    config = Object.assign(config, apiConfig, db.getOptions());
    log.debug('effective options', config);
    const direction = db.getDirection();
    allCommitsDict = db.getCommits();
    const branches = db.getBranchesAsObjArray();
    if (direction === 'BT') {
      config.nodeLabel.x = branches.length * config.branchOffset;
      config.nodeLabel.width = '100%';
      config.nodeLabel.y = -1 * 2 * config.nodeRadius;
    }
    const svg = root.select(`[id="${id}"]`);
    svgCreateDefs(svg);
    branchNum = 1;
    for (let branch in branches) {
      const v = branches[branch];
      renderCommitHistory(svg, v.commit.id, branches, direction);
      renderLines(svg, v.commit, direction);
      branchNum++;
    }
    svg.attr('height', function () {
      if (direction === 'BT') return Object.keys(allCommitsDict).length * config.nodeSpacing;
      return (branches.length + 1) * config.branchOffset;
    });
  } catch (e) {
    log.error('Error while rendering gitgraph');
    log.error(e.message);
  }
};

export default {
  setConf,
  draw,
};
