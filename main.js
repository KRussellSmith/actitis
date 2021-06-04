'use strict';
const Mat4 = (() =>
{
	const { mat3, mat4, vec2, vec3, vec4 } = glMatrix;
	return {
		...mat4,
		zAxis(out, mat)
		{
			return vec3.set(out, mat[2], mat[6], mat[10]);
		},
		mulVec4(out, mat, vec)
		{
			const [x, y, z, w] = vec;
			return vec3.set(out,
				mat[0] * x + mat[1] * y + mat[2] * z + mat[3] * w,
				mat[4] * x + mat[5] * y + mat[6] * z + mat[7] * w,
				mat[8] * x + mat[9] * y + mat[10] * z + mat[11] * w,
				mat[12] * x + mat[13] * y + mat[14] * z + mat[15] * w);
		},
		mulPoint(out, mat, vec)
		{
			const [x, y, z] = vec;
			const w = mat[12] * x + mat[13] * y + mat[14] * z + mat[15];
			return vec3.set(out,
				(mat[0] * x + mat[1] * y + mat[2] * z + mat[3]) / w,
				(mat[4] * x + mat[5] * y + mat[6] * z + mat[7]) / w,
				(mat[8] * x + mat[9] * y + mat[10] * z + mat[11]) / w);
		},
	};
})();

const startsWith = (str, ...args) =>
{
	for (const arg of args)
	{
		if (str.length >= arg.length && str.substring(0, arg.length) === arg)
		{
			return true;
		}
	}
	return false;
};

const filterLines = (text, cond) => text.split('\n').filter(line => cond(line)).join('\n');
const loadShader = async (gl, url, type) =>
{
	const text = await fetch(url).then(response => response.text());
	const attributes = [];
	const uniforms = [];
	// This is a highly specialized parser (I wasn't about to write a complete one to find attributes and uniforms):
	const parsed = (
		// Remove the lines starting with '#' (i.e. #version) and // (commments):
		filterLines(text, line => !startsWith(line, '#', '//'))
		// Split text into lines from semicolons:
		.split(/[;]/)
		// Remove trailing whitespace, split lines into lexemes from whitspace:
		.map(line => line.trim().split(/\s+/)));
	for (const line of parsed)
	{
		if (startsWith(line[0], 'in', 'attribute'))
		{
			attributes.push(/\w*/.exec(line[line.length - 1]));
		}
		else if (startsWith(line[0], 'uniform'))
		{
			//alert(true)
			uniforms.push(/\w*/.exec(line[line.length - 1]));
		}
	}
	const shader = gl.createShader(type);
	gl.shaderSource(shader, text);
	gl.compileShader(shader);

	return {
		shader,
		attributes,
		uniforms
	};
};
const linkedProgram = async (gl, vertUrl, fragUrl) =>
{
	const vertShader = await loadShader(gl, vertUrl, gl.VERTEX_SHADER);
	const fragShader = await loadShader(gl, fragUrl, gl.FRAGMENT_SHADER);

	const program = gl.createProgram();
	gl.attachShader(program, vertShader.shader)
	gl.attachShader(program, fragShader.shader);
	gl.linkProgram(program);

	const attributes = vertShader.attributes;
	const uniforms = [...vertShader.uniforms, ...fragShader.uniforms]
	const attribute = {},
		uniform = {};
	for (const attrib of attributes)
	{
		Object.defineProperty(attribute, attrib, {
			get: () => gl.getAttribLocation(program, attrib),
		});
	}
	for (const uni of uniforms)
	{
		Object.defineProperty(uniform, uni, {
			get: () => gl.getUniformLocation(program, uni),
		});
	}

	return {
		program,
		attribute,
		uniform,
	};
};
const Mesh = (() =>
{
	const { vec3 } = glMatrix;
	return {
		async load(url)
		{
			const text = await fetch(url).then(response => response.text());
			const positions = [[0, 0, 0]];
			const uvs = [[0, 0]];
			const normals = [[0, 0, 0]];

			const vertexData = [
				positions, uvs, normals
			];
			let webGlData = [
				[],
				[],
				[],
			];

			let geometry = null;
			const materialLibs = [];
			const geometries = [];
			let groups = ['default'];
			let material = 'default';
			let object = 'default';

			const addGeometry = () => geometry = null;
			const setGeometry = () =>
			{
				const position = [];
				const texcoord = [];
				const normal = [];
				if (geometry === null)
				{
					webGlData = [
						position, texcoord, normal,
					];
					geometry = {
						object,
						groups,
						material,
						data: {
							position,
							texcoord,
							normal,
						},
					};
					geometries.push(geometry);
				}
			};
			const addVertex = vert =>
			{
				vert.split('/').forEach((val, i) =>
				{
					if (val === '')
					{
						return;
					}
					const value = parseInt(val);
					const index = value + (value >= 0 ? 0 : vertexData[i].length);
					webGlData[i].push(...vertexData[i][index]);

				});
			};
			const keywords = {
				v(parts)
				{
					positions.push(parts.slice(0, 3).map(parseFloat));
					if (parts.length > 3)
					{
						//colors.push(parts.slice(3).map(parseFloat));
					}
				},
				vn(parts)
				{
					normals.push(parts.map(parseFloat));
				},
				vt(parts)
				{
					uvs.push(parts.map(parseFloat));
				},
				f(parts)
				{
					setGeometry();
					const tris = parts.length - 2;
					for (let i = 0; i < tris; ++i)
					{
						addVertex(parts[0]);
						addVertex(parts[i + 1]);
						addVertex(parts[i + 2]);
					}
				},
				s() {},
				mtllib(parts, args)
				{
					materialLibs.push(args);
				},
				usemtl(parts, args)
				{
					material = args;
					addGeometry();
				},
				g(parts)
				{
					groups = parts;
					addGeometry();
				},
				o(parts, args)
				{
					object = args;
					addGeometry();
				}
			};
			(text.split('\n')
				.map(line => line.trim())
				.forEach(line =>
				{
					if (line === '' || line[0] === '#')
					{
						return;
					}
					const parsed = /(\w*)(?: )*(.*)/.exec(line);
					if (!parsed) return;
					const parts = line.split(/\s+/).slice(1);
					const [, keyword, args] = parsed;
					if (keyword in keywords)
					{
						keywords[keyword](parts, args);
					}
				}));
			for (const geometry of geometries)
			{
				geometry.data = Object.fromEntries(
					Object.entries(geometry.data).filter(([, array]) => array.length > 0));
			}
			return {
				geometries,
				materialLibs
			};
		},
		Model: async (gl, mesh, color = [0.5, 0.2, 0]) =>
		{
			const shader = await Shader(gl, '.', 'mesh-shader');

			const parts = mesh.geometries.map(({ data }) =>
			{
				const { a_position, a_normal } = shader.attribute;

				const vao = gl.createVertexArray();
				gl.bindVertexArray(vao);

				const buffers = createBuffers(gl, new Array(2));
				setupArrayBuffer(gl, buffers[0], new Float32Array(data.position), 3, a_position);
				setupArrayBuffer(gl, buffers[1], new Float32Array(data.normal), 3, a_normal);
				console.log(JSON.stringify(mesh))
				return {
					material: {
						u_diffuse: [...color, 1],
					},
					size: data.position.length / 3,
					vao,
				}
			});
			return {
				render(projection, viewModel = Mat4.create(), world = Mat4.create())
				{
					//console.log(shader.uniform.u_diffuse);
					const { u_mvp, u_mv, u_world, u_lightDirection, u_diffuse } = shader.uniform;
					shader.use();
					gl.uniformMatrix4fv(u_mv, false, viewModel);

					gl.uniform3fv(u_lightDirection, vec3.normalize(vec3.create(), [-0, 3, 0]));
					gl.uniformMatrix4fv(u_mvp, false, projection);
					for (const { size, vao, material } of parts)
					{
						gl.bindVertexArray(vao);
						gl.uniformMatrix4fv(u_world, false, world);
						gl.uniform4fv(u_diffuse, material.u_diffuse);
						gl.drawArrays(gl.TRIANGLES, 0, size);
					}
				}
			}
		},
	}
})();


const TouchArray = (canvas, update) =>
{
	const touches = new Array(10);
	for (let i = 0; i < touches.length; ++i)
	{
		touches[i] = {
			x: 0,
			y: 0,
			px: 0,
			py: 0,
			pressed: false,
		};
	}

	const handleTouch = handleMoving => e =>
	{
		e.preventDefault();
		const box = canvas.getBoundingClientRect();
		for (let i = e.touches.length - 1; i >= 0; --i)
		{
			const touch = e.touches[i];
			if (i >= touches.length)
			{
				continue;
			}
			const p = touch.identifier;
			const x = touch.pageX;
			const y = touch.pageY;
			if (handleMoving)
			{
				touches[p].px = touches[p].x;
				touches[p].py = touches[p].y;
				touches[p].x = Math.round((x - box.left) / (box.right - box.left) * canvas.width);
				touches[p].y = Math.round((y - box.top) / (box.bottom - box.top) * canvas.height);
			}
			else
			{
				touches[p].x = Math.round((x - box.left) / (box.right - box.left) * canvas.width);
				touches[p].y = Math.round((y - box.top) / (box.bottom - box.top) * canvas.height);
				touches[p].px = touches[p].x;
				touches[p].py = touches[p].y;
			}
			touches[p].pressed = (
				x > box.left &&
				y > box.top &&
				x < box.right &&
				y < box.bottom);
		}
		update(touches);
	};
	const findTouch = (e, id) =>
	{
		for (const touch of e.touches)
		{
			if (touch.identifier === id)
			{
				return true;
			}
		}
		return false;
	};
	canvas.addEventListener('touchstart', handleTouch(false));
	canvas.addEventListener('touchmove', handleTouch(true));
	canvas.addEventListener('touchend', e =>
	{
		for (let i = 0; i < touches.length; ++i)
		{
			if (!findTouch(e, i))
			{
				touches[i].pressed = false;
			}
		}
		update(touches);
	});
	update(touches)
	return touches;
};
const JoyStick = (ctx, x, y) =>
{
	const { vec2 } = glMatrix;
	const origin = vec2.set(vec2.create(), x, y);
	const pos = vec2.set(vec2.create(), 0, 0);
	let pointer = -1;
	const outer = Math.min(ctx.canvas.width, ctx.canvas.height) / 7;
	const inner = outer / 2;
	const hasPointer = () => pointer >= 0;
	return {
		get x()
		{
			return pos[0] / (outer - inner);
		},
		get y()
		{
			return pos[1] / (outer - inner);
		},
		draw(touches)
		{
			if (!hasPointer())
			{
				for (let i = 0; i < touches.length; ++i)
				{
					if (touches[i].pressed && vec2.distance(origin, [touches[i].x, touches[i].y]) <= outer)
					{
						pointer = i;
						break;
					}
				}
			}
			if (hasPointer())
			{
				vec2.subtract(pos,
					vec2.set(pos,
						touches[pointer].x,
						touches[pointer].y),
					origin);

				const dist = outer - inner;
				if (vec2.length(pos) >= dist)
				{
					vec2.multiply(pos, vec2.normalize(pos, pos), [dist, dist]);
				}
				if (!touches[pointer].pressed)
				{
					pointer = -1;
					vec2.set(pos, 0, 0);
				}
			}
			ctx.fillStyle = 'white';
			ctx.globalAlpha = 0.25;
			ctx.beginPath();
			ctx.arc(origin[0], origin[1], outer, outer, 0, Math.PI * 2);
			ctx.closePath();
			ctx.fill();
			ctx.globalAlpha = 0.5;
			ctx.beginPath();
			ctx.arc(origin[0] + pos[0], origin[1] + pos[1], inner, inner, 0, Math.PI * 2);
			ctx.closePath();
			ctx.fill();
			ctx.globalAlpha = 1;
		},
	};
};
const Camera = () =>
{
	const { vec3, vec4 } = glMatrix;
	const projection = Mat4.create();
	const view = Mat4.create();
	return {
		width: 0,
		height: 0,
		aspect: 1,
		near: 0.1,
		far: 100.0,
		fov: Math.PI / 3,
		pos: [0, 0, 0],
		euler: [0, 0, 0],
		get view()
		{
			return view;
		},
		set view(matrix)
		{
			return Mat4.copy(view, matrix);
		},
		get matrix()
		{
			return Mat4.multiply(Mat4.create(), projection, view)
		},
		get projection()
		{
			return projection;
		},
		set transform([x = 0, y = 0, z = 0, rx = 0, ry = 0])
		{
			const matrix = Mat4.fromXRotation(Mat4.create(), rx);
			Mat4.multiply(matrix, matrix, Mat4.fromYRotation(Mat4.create(), ry));
			Mat4.multiply(matrix, matrix, Mat4.fromTranslation(Mat4.create(), [-x, -y, -z]));
			Mat4.copy(view, matrix);
			return view;
		},
		inverse()
		{
			const inv = Mat4.create();
			const a = projection[0];
			const b = projection[5];
			const c = projection[10];
			const d = projection[11];
			const e = projection[14];
			inv[0] = 1 / a;
			inv[5] = 1 / b;
			inv[11] = 1 / e;
			inv[14] = 1 / d;
			inv[15] = -c / (d * e)
			return inv;
		},
		clipOblique(pos, norm)
		{
			const { projection, view } = this;
			const cpos = Mat4.mulPoint(vec3.create(), view, [...pos, 1]);
			const cnorm = Mat4.mulPoint(vec3.create(), view, [...norm, 1]);
			//const point = Mat4.mulPoint(vec3.create(), Mat4.invert(Mat4.create(), view), [0, 0, 0]);
			//cpos[1] -= point[1];
			const cplane = vec4.set(vec4.create(), cnorm[0], cnorm[1], cnorm[2], -vec3.dot(cpos, cnorm));
			const q = [
				(Math.sign(cplane[0]) + projection[8]) / projection[0],
				(Math.sign(cplane[1]) + projection[9]) / projection[5],
				-1,
				(1 + projection[10]) / projection[14]];
			const c = cplane.map(x => x * (2 / vec4.dot(cplane, q)));
			projection[2] = c[0];
			projection[6] = c[1];
			projection[10] = c[2] + 1;
			projection[14] = c[3];
		},
		copy(that)
		{
			this.setup(that.width, that.height, that.near, that.far, that.fov, that.aspect);
			Mat4.copy(view, that.view);
			Mat4.copy(projection, that.projection);
			return this;
		},
		setup(width = this.width, height = this.height, near = this.near, far = this.far, fov = this.fov, aspect = height / width)
		{
			this.width = width;
			this.height = height;
			this.near = near;
			this.far = far;
			this.fov = fov;
			this.aspect = aspect;

			const f = 1.0 / Math.tan(fov / 2);
			const range = 1.0 / (near - far);

			projection[0] = f * aspect
			projection[1] = 0.0;
			projection[2] = 0.0;
			projection[3] = 0.0;

			projection[4] = 0.0;
			projection[5] = f;
			projection[6] = 0.0;
			projection[7] = 0.0;

			projection[8] = 0.0;
			projection[9] = 0.0;
			projection[10] = (near + far) * range;
			projection[11] = -1.0;

			projection[12] = 0.0;
			projection[13] = 0.0;
			projection[14] = 2 * near * far * range;
			projection[15] = 0.0;
			return this;
		}
	}
};

const vector = (x = 0, y = 0, z = 0) => glMatrix.vec3.set(glMatrix.vec3.create(), x, y, z);

const createBuffers = (gl, dest = [], pos = 0, num = dest.length) =>
{
	for (let i = pos; i < num; ++i)
	{
		dest[i] = gl.createBuffer();
	}
	return dest;
};
const setupArrayBuffer = (
	gl, buffer, data, itemSize, attribute,
	drawType = gl.STATIC_DRAW, dataType = gl.FLOAT) =>
{
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, data, drawType);
	gl.enableVertexAttribArray(attribute);
	gl.vertexAttribPointer(attribute, itemSize, dataType, false, 0, 0);
};

const Sprite = async (gl) =>
{
	const mesh = await Mesh.load('double_quad.obj');
	const shader = await Shader(gl, '.', 'quad-shader');
	const { a_position } = shader.attribute;
	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);
	const buffers = createBuffers(gl, new Array(1));
	setupArrayBuffer(gl, buffers[0], new Float32Array(mesh.geometries[0].data.position), 3, a_position);

	return {
		render(projection, view)
		{
			shader.use();
			gl.bindVertexArray(vao);

			const { u_projection, u_view, u_texture } = shader.uniform;

			gl.uniform1i(u_texture, 0);
			gl.activeTexture(gl.TEXTURE0 + 0);

			gl.uniformMatrix4fv(u_projection, false, projection);
			gl.uniformMatrix4fv(u_view, false, view);
			gl.drawArrays(gl.TRIANGLES, 0, mesh.geometries[0].data.position.length / 3);
			return this;
		},
	};
};
const Circle = async (gl) =>
{
	const pos = new Float32Array([
		-1, 1,
		-1, -1,
		 1, -1,
		 1, 1]);
	const indices = new Uint16Array([3, 2, 1, 3, 1, 0]);
	const colors = (new Array(16)).fill(1);

	const shader = await Shader(gl, 'shaders', 'circle');

	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);
	const { a_position, a_texcoord, a_color } = shader.attribute;
	const buffers = createBuffers(gl, new Array(4));
	setupArrayBuffer(gl, buffers[0], pos, 2, a_position);
	setupArrayBuffer(gl, buffers[1], pos, 2, a_texcoord);
	setupArrayBuffer(gl, buffers[2], new Float32Array(colors), 4, a_color, gl.DYNAMIC_DRAW);

	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers[3]);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)

	return {
		color(r, g = r, b = g, a = 1)
		{
			for (let i = 0; i < 4; ++i)
			{
				const c = i * 4;
				colors[c + 0] = r;
				colors[c + 1] = g;
				colors[c + 2] = b;
				colors[c + 3] = a;
			}
			gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(colors));
			return this;
		},
		vcolor(pos, newColors)
		{
			gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
			gl.bufferSubData(gl.ARRAY_BUFFER, pos, new Float32Array(newColors));
			return this;
		},
		render(x, y, w, h)
		{
			const { u_matrix } = shader.uniform;
			shader.use();
			gl.bindVertexArray(vao);
			let matrix = glMatrix.Mat4.ortho(glMatrix.Mat4.create(), 0, gl.canvas.width, gl.canvas.height, 0, -1000, 1);
			glMatrix.Mat4.translate(matrix, matrix, [x, y, 0]);
			glMatrix.Mat4.scale(matrix, matrix, [w, h, 1]);
			gl.uniformMatrix4fv(u_matrix, false, matrix);

			gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
			return this;
		},
	};
};
const Game = {
	objects: [],
	renderObjects(camera)
	{
		for (const obj of this.objects)
		{

		}
	}
};
const loadImage = (url, onload) =>
{
	const image = new Image();
	fetch(url).then(response => response.blob()).then(blob =>
	{
		image.onload = () => onload(image);
		image.src = URL.createObjectURL(blob);
	});
	return image;
};
const loadAudio = (url, onload) =>
{
	const audio = {};
	(fetch(url)
		.then(resonse => resonse.arrayBuffer())
		.then(arrayBuffer => audioCtx.decodeAudioData(arrayBuffer))
		.then(audioData => {
			audio.data = audioData;
			onload();
		}));
	return audio;
}
const Texture = (() =>
{
	return {
		create(gl)
		{
			const tex = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, tex);
			//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			const result = {
				image: null,
				tex,
				width: 1,
				height: 1,
			};
			return result;
		},
		apply(gl, texture, image)
		{
			texture.width = image.width;
			texture.height = image.height;
			texture.image = image;
			gl.bindTexture(gl.TEXTURE_2D, texture.tex);
			//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
			//gl.generateMipmap(gl.TEXTURE_2D);
		}
	}
})();
const FrameBuffer = gl =>
{
	const SIZE = 2048;
	const fbo = gl.createFramebuffer();

	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

	const texture = gl.createTexture();

	gl.bindTexture(gl.TEXTURE_2D, texture);

	gl.texImage2D(
		gl.TEXTURE_2D, 0, gl.RGB,
		SIZE, SIZE,
		0, gl.RGB, gl.UNSIGNED_BYTE, null);

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
	const rbo = gl.createRenderbuffer();
	gl.bindRenderbuffer(gl.RENDERBUFFER, rbo);
	gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SIZE, SIZE)
	gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rbo);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	return {
		use()
		{
			gl.bindTexture(gl.TEXTURE_2D, texture);
		},
		render(func)
		{
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
			gl.viewport(0, 0, SIZE, SIZE);
			func(gl);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		},
	}
};
const Shader = async (gl, path, name) =>
{
	const vert = await loadShader(gl, path + '/' + name + '.vert', gl.VERTEX_SHADER);
	const frag = await loadShader(gl, path + '/' + name + '.frag', gl.FRAGMENT_SHADER);

	const program = gl.createProgram();
	gl.attachShader(program, vert.shader);
	gl.attachShader(program, frag.shader);
	gl.linkProgram(program);

	const attributes = vert.attributes;
	const uniforms = [...vert.uniforms, ...frag.uniforms];
	const [ attribute, uniform ] = [{}, {}];
	for (const attrib of attributes)
	{
		Object.defineProperty(attribute, attrib, {
			get: () => gl.getAttribLocation(program, attrib),
		});
	}

	for (const uni of uniforms)
	{
		Object.defineProperty(uniform, uni, {
			get: () => gl.getUniformLocation(program, uni),
		});
	}

	return {
		use()
		{
			gl.useProgram(program);
		},
		attribute,
		uniform,
	};
};
const GameObject = (gl, mesh) =>
{
	const { vec3 } = glMatrix;
	return {
		pos: [0, 0, 0],
		euler: [0, 0, 0],
		scale: [1, 1, 1],
		mesh,
		forward()
		{
			const matrix = Mat4.fromZRotation(Mat4.create(), this.euler[2]);
			Mat4.multiply(matrix, matrix, Mat4.fromXRotation(Mat4.create(), this.euler[0]));
			Mat4.multiply(matrix, matrix, Mat4.fromYRotation(Mat4.create(), this.euler[1]));
			return vec3.negate(vec3.create(), Mat4.zAxis(vec3.create(), matrix));
		},
		localToWorld()
		{
			const matrix = Mat4.fromTranslation(Mat4.create(), this.pos);
			Mat4.multiply(matrix, matrix, Mat4.fromYRotation(Mat4.create(), this.euler[1]));
			Mat4.multiply(matrix, matrix, Mat4.fromXRotation(Mat4.create(), this.euler[0]));
			Mat4.multiply(matrix, matrix, Mat4.fromZRotation(Mat4.create(), this.euler[2]));
			Mat4.multiply(matrix, matrix, Mat4.fromScaling(Mat4.create(), this.scale));
			return matrix;
		},
		worldToLocal()
		{
			const matrix = Mat4.fromScaling(Mat4.create(), this.scale);
			Mat4.invert(matrix, matrix);
			Mat4.multiply(matrix, matrix, Mat4.fromZRotation(Mat4.create(), this.euler[2]));
			Mat4.multiply(matrix, matrix, Mat4.fromXRotation(Mat4.create(), this.euler[0]));
			Mat4.multiply(matrix, matrix, Mat4.fromYRotation(Mat4.create(), this.euler[1]));
			Mat4.multiply(matrix, matrix, Mat4.fromTranslation(Mat4.create(), vec3.negate(vec3.create(), this.pos)));
			return matrix;
		},
		render(camera, fbo = null)
		{
			const mv = Mat4.transpose(Mat4.create(), this.worldToLocal());
			const mvp = Mat4.multiply(Mat4.create(), camera.matrix, this.localToWorld());
			this.mesh.render(mvp, mv);
		},
	};
};

const Portal = (() =>
{
	const { vec3 } = glMatrix;
	const Warp = (fromPortal = {}) =>
	{
		const delta = Mat4.identity(Mat4.create());
		const deltaInv = Mat4.identity(Mat4.create());
		return {
			fromPortal,
			toPortal: null,
			delta,
			deltaInv,
		};
	};
	let camera = Camera();
	return {
		connectWarp(a, b)
		{
			a.toPortal = b.fromPortal;
			b.toPortal = a.toPortal;
			a.delta = Mat4.multiply(Mat4.create(), a.fromPortal.localToWorld(), b.fromPortal.worldToLocal());
			b.delta = Mat4.multiply(Mat4.create(), b.fromPortal.localToWorld(), a.fromPortal.worldToLocal());
			a.deltaInv = b.delta;
			b.deltaInv = a.delta;
			return this;
		},
		connect(a, b)
		{
			this.connectWarp(a.front, b.back);
			this.connectWarp(b.front, a.back);
			return this;
		},
		create: async (gl = (document.createElement('canvas')).getContext('webgl2')) =>
		{
			const mesh = await Mesh.load('double_quad.obj');
			const shader = await Shader(gl, '.', 'portal-shader');
			const { a_position } = shader.attribute;
			const vao = gl.createVertexArray();
			gl.bindVertexArray(vao);
			const buffers = createBuffers(gl, new Array(1));
			setupArrayBuffer(gl, buffers[0], new Float32Array(mesh.geometries[0].data.position), 3, a_position);

			const portalCam = Camera();
			return (self =>
			{
				self.front = Warp(self);
				self.back = Warp(self);
				return self;
			})({
				...GameObject(gl, null),
				front: null,
				back: null,
				bump(a = vec3.create())
				{

				},
				distTo(point = vec3.create())
				{

				},
				intersects(a = vec3.create(), b = vec3.create(), bump = vec3.create())
				{

				},
				get cam()
				{
					return portalCam;
				},
				/*Override*/
				render(camera, fbo, func)
				{
					console.assert(this.euler[0] === 0);
					console.assert(this.euler[2] === 0);
					const normal = this.forward();
					const camPos = Mat4.getTranslation(vec3.create(), Mat4.invert(Mat4.create(), camera.view));
					const isFront = vec3.dot(vec3.subtract(vec3.create(), camPos, this.pos), normal) > 0;

					if (isFront)
					{
						vec3.negate(normal, normal);
					}
					const warp = isFront ? this.front : this.back;
					const mvp = Mat4.multiply(Mat4.create(), camera.matrix, this.localToWorld());

					portalCam.copy(camera);
					portalCam.clipOblique(vec3.sub(vec3.create(), this.pos, normal.map(x => x * 0.1)), vec3.negate(vec3.create(), normal));
					Mat4.multiply(portalCam.view, portalCam.view, warp.delta);
					shader.use();
					gl.bindVertexArray(vao);

					const { u_mvp, u_texture } = shader.uniform;

					gl.uniform1i(u_texture, 0);
					gl.activeTexture(gl.TEXTURE0 + 0);
					fbo.use();

					gl.uniformMatrix4fv(u_mvp, false, mvp);
					gl.drawArrays(gl.TRIANGLES, 0, mesh.geometries[0].data.position.length / 3);
					return this;
				},
			});
		},
	};
})();
const Player = (gl) =>
{
	const { vec2, vec3 } = glMatrix;
	let dirX = -1,
		dirY = 0;
	const camera = Camera().setup(gl.canvas.width, gl.canvas.height, 0.1, 1000.0, Math.PI / 3);
	return {
		...GameObject(null),
		camera,
		handleInput({ move, camera })
		{
			const { euler, pos } = this;
			const vel = [(move.x / 10), (move.y / 10)];
			vec2.rotate(vel, vel, [0, 0], euler[1]);
			pos[0] += vel[0];
			pos[2] += vel[1];
			euler[1] += camera.x / 70;
			euler[0] += camera.y / 70;
		},
		update()
		{
			this.camera.transform = [this.pos[0], this.pos[1], this.pos[2], this.euler[0], this.euler[1]];
		},
	}
}
const Scene = (() =>
{
	return {
		async Load(gl, files, dump)
		{
			const size = Object.entries(files).length;
			let progress = 0;
			const display = document.createElement('canvas');
			const { width, height } = gl.canvas;
			renderer.top.Sprite.link(gl);
			//const playerImage = await Texture.create(gl, 'textures/playerFace_dark.png');
			const text = Texture.create(gl);
			const ctx = display.getContext('2d');
			const loadFunc = () => ++progress;
			for (const key in files)
			{
				switch (files[key].type)
				{
					case File.type.IMAGE:
						dump[key] = loadImage(files[key].path, loadFunc);
						break;
						/*case File.type.TEXT:
							dump[key] = loadText(files[key].path, loadFunc);
							break;*/
					case File.type.AUDIO:
						dump[key] = loadAudio(files[key].path, loadFunc);
						break;
				}
			}
			return {
				render()
				{
					const glCtx = renderer.top;
					gl.clearColor(0, 0, 0, 1)
					display.width = Math.min(width, height);
					display.height = display.width;
					{
						const { width, height } = display;
						ctx.clearRect(0, 0, width, height);
						ctx.font = `${Math.trunc(display.width / 10)}pt Arial bold`;
						ctx.fillStyle = 'white';
						ctx.textAlign = 'center';
						ctx.textBaseline = 'middle';
						ctx.fillText(Math.trunc(100 / size * progress), width / 2, height / 2);
					}
					Texture.apply(gl, text, display);
					const spriteMat = Mat4.create();
					Mat4.translate(spriteMat, spriteMat, vec3(width / 2, height / 2));
					Mat4.scale(spriteMat, spriteMat, vec3(display.width, display.height, 1));
					renderer.top.Sprite.render(gl, text, camera, spriteMat);
					if (progress >= size)
					{
						//alert('foo!')
						return Scene.Game(renderer);
					}
					return this;
				},
			};
		},
		Game(renderer)
		{
			const { gl, camera, assets } = renderer;
			const player = Player(gl, assets);

			//Texture.apply(gl, player, assets['Grass']);
			return {
				render()
				{
					gl.clearColor(0.2, 0.6, 0.4, 1);
					player.render(renderer);
					return this;
				}
			}
		},
	};
})();
const main = async () =>
{
	const canvas = document.querySelector('#master-canvas');
	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;
	const gl = canvas.getContext('webgl2');

	const overlay = document.querySelector('#overlay-canvas');
	overlay.width = overlay.clientWidth;
	overlay.height = overlay.clientHeight;
	const ctx = overlay.getContext('2d');
	const inputs = {
		move: JoyStick(ctx, overlay.width * 0.2, overlay.height * 0.85),
		camera: JoyStick(ctx, overlay.width * 0.8, overlay.height * 0.85),
	}
	const touches = TouchArray(overlay, touches =>
	{
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		for (const key in inputs)
		{
			inputs[key].draw(touches);
		}
	});
	const mesh = await Mesh.Model(gl, await Mesh.load('suzanne.obj'));
	const { vec2, vec3 } = glMatrix;
	const player = Player(gl);
	const sprite = await Portal.create(gl);
	const world = await Portal.create(gl);
	//alert(sprite.pos);
	const FB = FrameBuffer(gl);
	//test(...(new Array(3)).fill(0).map(x => Math.random() * Math.PI));
	const Suzanne = GameObject(gl, mesh);
	Suzanne.pos[2] = 5;
	player.pos[0] = 0;
	player.pos[1] = 0.5;
	player.pos[2] = 10;
	const roomMesh = await Mesh.Model(gl, await Mesh.load('room.obj'), [0.5, 0.5, 0.5]);
	//alert(JSON.stringify(roomMesh));
	const room = GameObject(gl, roomMesh);
	const otherRoom = GameObject(gl, await Mesh.Model(gl, await Mesh.load('room.obj'), [0.1, 0.4, 0.1]));
	otherRoom.pos = [0, -1, 0]
	otherRoom.scale = [20, 1, 20];
	/*
	 -1, -1, -1,
	 -1, -1, +1,
	 +1, -1, -1,
	 +1, -1, -1,
	 -1, -1, +1,
	 +1, -1, +1
	*/
	/*	-0.5, -0.5,
		-0.5, +0.5,
		+0.5, -0.5,
		+0.5, -0.5,
		-0.5, +0.5,
		+0.5, +0.5*/
	const coords = new Float32Array([
		0, 0,
		0, 1,
		1, 0,
		1, 0,
		0, 1,
		1, 1]);
	//console.log(vec3.cross(vec3.create(), [0, 0 -1], [-1, 0, 0]));
	//room.scale = [20, 1, 20];
	//room.pos[1] = 2;
	sprite.euler[1] = -0.1;
	sprite.pos = [0, 0, 0];
	Portal.connect(sprite, sprite);
	room.pos = [0, -1, 0];
	player.pos[1] = -1;
	room.scale = [20, 1, 20];
	const draw = time =>
	{
		//sprite.euler[1] -= 0.01;
		sprite.scale = [3, 2, 2];
		//player.pos[1] -= 0.001;
		window.requestAnimationFrame(draw);
		//room.euler[0] += 0.001;
		FB.render(gl =>
		{
			const camera = Camera();
			gl.enable(gl.DEPTH_TEST);
			gl.enable(gl.CULL_FACE);
			gl.clearColor(0, 0, 0, 1);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			camera.setup(gl.canvas.width, gl.canvas.height, 0.1, 1000.0, Math.PI / 3);
			camera.transform = [0, 0, 10, 0, 0];
			const modelViewMatrix = Mat4.create();
			Mat4.translate(modelViewMatrix, modelViewMatrix, [0, 0, 0]);
			//Mat4.rotate(modelViewMatrix, modelViewMatrix, time * 0.001, [0, 1, 0]);
			//Mat4.rotate(modelViewMatrix, modelViewMatrix, -Math.PI / 2, [1, 0, 0]);
			otherRoom.render(sprite.cam);
			Suzanne.render(sprite.cam);
			//Suzanne.pos[2] += 0.05;
		});
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.enable(gl.DEPTH_TEST);
		gl.enable(gl.CULL_FACE);

		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		player.handleInput(inputs);
		room.render(player.camera);
		player.update();
		//Suzanne.render(player.camera);
		sprite.render(player.camera, FB);
		ctx.fillStyle = 'white';
		ctx.fillText(player.euler[1], 0, 20);
	};
	window.requestAnimationFrame(draw);
};