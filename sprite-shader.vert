#version 300 es
in vec2 pos;
in vec2 coord;
uniform mat4 mvp;
uniform mat4 mv;
out vec2 v_coord;
void main()
{
	gl_Position = mvp * mv * pos;
	v_coord = coord;
}